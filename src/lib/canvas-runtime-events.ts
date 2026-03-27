import { EventEmitter } from "node:events";

import { createClient } from "redis";

import { env } from "@/lib/env";

type CanvasRuntimeEvent = {
  workspaceId: string;
  canvasId: string;
  reason: string;
  emittedAt: string;
};

const canvasRuntimeEventEmitter = new EventEmitter();
const channelListenerCounts = new Map<string, number>();
const subscribedRedisChannels = new Set<string>();
type CanvasRedisClient = ReturnType<typeof createClient>;

let redisPublisherPromise: Promise<CanvasRedisClient> | null = null;
let redisSubscriberPromise: Promise<CanvasRedisClient> | null = null;

canvasRuntimeEventEmitter.setMaxListeners(0);

function getCanvasRuntimeEventName(workspaceId: string, canvasId: string) {
  return `canvas-runtime:${workspaceId}:${canvasId}`;
}

function getRedisPublisher() {
  if (!env.redisUrl) {
    return null;
  }

  if (!redisPublisherPromise) {
    const client = createClient({
      url: env.redisUrl,
    });

    client.on("error", (error) => {
      console.error("[canvas-runtime-events] redis publisher error", error);
    });

    redisPublisherPromise = client.connect().then(() => client);
  }

  return redisPublisherPromise;
}

function getRedisSubscriber() {
  if (!env.redisUrl) {
    return null;
  }

  if (!redisSubscriberPromise) {
    const client = createClient({
      url: env.redisUrl,
    });

    client.on("error", (error) => {
      console.error("[canvas-runtime-events] redis subscriber error", error);
    });

    redisSubscriberPromise = client.connect().then(() => client);
  }

  return redisSubscriberPromise;
}

async function ensureRedisSubscription(channel: string) {
  const subscriberPromise = getRedisSubscriber();

  if (!subscriberPromise || subscribedRedisChannels.has(channel)) {
    return;
  }

  const subscriber = await subscriberPromise;

  await subscriber.subscribe(channel, (message) => {
    const event = JSON.parse(message) as CanvasRuntimeEvent;
    canvasRuntimeEventEmitter.emit(channel, event);
  });

  subscribedRedisChannels.add(channel);
}

async function releaseRedisSubscription(channel: string) {
  const subscriberPromise = getRedisSubscriber();

  if (!subscriberPromise || !subscribedRedisChannels.has(channel)) {
    return;
  }

  const subscriber = await subscriberPromise;

  await subscriber.unsubscribe(channel);
  subscribedRedisChannels.delete(channel);
}

export function notifyCanvasRuntimeChanged(input: {
  workspaceId: string;
  canvasId: string;
  reason: string;
}) {
  const event: CanvasRuntimeEvent = {
    workspaceId: input.workspaceId,
    canvasId: input.canvasId,
    reason: input.reason,
    emittedAt: new Date().toISOString(),
  };
  const channel = getCanvasRuntimeEventName(input.workspaceId, input.canvasId);
  const publisherPromise = getRedisPublisher();

  if (!publisherPromise) {
    canvasRuntimeEventEmitter.emit(channel, event);

    return;
  }

  void publisherPromise
    .then((publisher) => publisher.publish(channel, JSON.stringify(event)))
    .catch((error) => {
      console.error("[canvas-runtime-events] redis publish failed", error);
      canvasRuntimeEventEmitter.emit(channel, event);
    });
}

export function subscribeCanvasRuntime(
  input: {
    workspaceId: string;
    canvasId: string;
  },
  listener: (event: CanvasRuntimeEvent) => void,
) {
  const eventName = getCanvasRuntimeEventName(input.workspaceId, input.canvasId);
  const activeListenerCount = channelListenerCounts.get(eventName) ?? 0;

  channelListenerCounts.set(eventName, activeListenerCount + 1);
  canvasRuntimeEventEmitter.on(eventName, listener);

  void ensureRedisSubscription(eventName).catch((error) => {
    console.error("[canvas-runtime-events] redis subscribe failed", error);
  });

  return () => {
    canvasRuntimeEventEmitter.off(eventName, listener);

    const remainingListenerCount = Math.max(0, (channelListenerCounts.get(eventName) ?? 1) - 1);

    if (remainingListenerCount === 0) {
      channelListenerCounts.delete(eventName);
      void releaseRedisSubscription(eventName).catch((error) => {
        console.error("[canvas-runtime-events] redis unsubscribe failed", error);
      });

      return;
    }

    channelListenerCounts.set(eventName, remainingListenerCount);
  };
}
