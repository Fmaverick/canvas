import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "@/app/v1/gateway/route";
import { generateGatewayClientKeys } from "@/lib/gateway-client-keys";
import { __gatewayProviderRegistryTestUtils } from "@/lib/gateway-provider-registry";

test("gateway 图片生成：映射到 volcengine images/generations 并返回统一输出", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  process.env.VOLCENGINE_ARK_API_KEY = "volcengine-secret-key-001";
  process.env.VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        created: 1,
        request_id: "req_volc_001",
        trace: {
          keyId: "volcengine-key-1",
        },
        data: [
          {
            url: "https://cdn.example.com/generated-4k.png",
            size: "4096x4096",
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_success",
        },
        body: JSON.stringify({
          modality: "image",
          model: "doubao-seedream-4-5-251128",
          prompt: "生成一张 4K 商品图",
          settings: {
            size: "4K",
            watermark: true,
          },
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(capturedBody, {
      model: "doubao-seedream-4-5-251128",
      prompt: "生成一张 4K 商品图",
      response_format: "url",
      size: "4096x4096",
      stream: false,
      watermark: true,
    });

    const payload = (await response.json()) as Record<string, unknown>;

    assert.deepEqual(payload, {
      requestId: "req_test_gateway_image_success",
      modality: "image",
      model: "doubao-seedream-4-5-251128",
      provider: "volcengine",
      output: [
        {
          kind: "url",
          url: "https://cdn.example.com/generated-4k.png",
          width: 4096,
          height: 4096,
        },
      ],
      metadata: {
        size: "4K",
        responseFormat: "url",
        trace: {
          requestId: "req_volc_001",
          keyId: "volcengine-key-1",
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});

test("gateway 图片生成：size=2K 成功并返回标准输出", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  process.env.VOLCENGINE_ARK_API_KEY = "volcengine-secret-key-001";
  process.env.VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        created: 1,
        request_id: "req_volc_2k_001",
        trace: {
          keyId: "volcengine-key-1",
        },
        data: [
          {
            url: "https://cdn.example.com/generated-2k.png",
            size: "2048x2048",
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_2k_success",
        },
        body: JSON.stringify({
          modality: "image",
          model: "doubao-seedream-4-5-251128",
          prompt: "生成一张 2K 商品图",
          settings: {
            size: "2K",
          },
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(capturedBody, {
      model: "doubao-seedream-4-5-251128",
      prompt: "生成一张 2K 商品图",
      response_format: "url",
      size: "2048x2048",
      stream: false,
      watermark: false,
    });

    const payload = (await response.json()) as Record<string, unknown>;

    assert.deepEqual(payload, {
      requestId: "req_test_gateway_image_2k_success",
      modality: "image",
      model: "doubao-seedream-4-5-251128",
      provider: "volcengine",
      output: [
        {
          kind: "url",
          url: "https://cdn.example.com/generated-2k.png",
          width: 2048,
          height: 2048,
        },
      ],
      metadata: {
        size: "2K",
        responseFormat: "url",
        trace: {
          requestId: "req_volc_2k_001",
          keyId: "volcengine-key-1",
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});

test("gateway 图片生成：非法 size 返回 VALIDATION_ERROR", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  process.env.VOLCENGINE_ARK_API_KEY = "volcengine-secret-key-001";
  process.env.VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for invalid size");
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_invalid_size",
        },
        body: JSON.stringify({
          modality: "image",
          model: "doubao-seedream-4-5-251128",
          prompt: "生成图片",
          settings: {
            size: "1K",
          },
        }),
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(fetchCalled, false);

    const payload = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
    assert.match(payload.error.message, /分辨率等级仅支持 2K 或 4K/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});

test("gateway 图片生成：供应商不可用返回 PROVIDER_UNAVAILABLE", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  delete process.env.VOLCENGINE_ARK_API_KEY;
  delete process.env.VOLCENGINE_ARK_BASE_URL;

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called when provider is unavailable");
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_provider_unavailable",
        },
        body: JSON.stringify({
          modality: "image",
          model: "doubao-seedream-4-5-251128",
          prompt: "生成图片",
        }),
      }),
    );

    assert.equal(response.status, 503);
    assert.equal(fetchCalled, false);

    const payload = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "PROVIDER_UNAVAILABLE");
    assert.match(payload.error.message, /volcengine/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});

test("gateway 图片生成：模型未启用返回 MODEL_NOT_ENABLED", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  process.env.VOLCENGINE_ARK_API_KEY = "volcengine-secret-key-001";
  process.env.VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for disabled model");
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_model_not_enabled",
        },
        body: JSON.stringify({
          modality: "image",
          model: "not-enabled-image-model",
          prompt: "生成图片",
        }),
      }),
    );

    assert.equal(response.status, 409);
    assert.equal(fetchCalled, false);

    const payload = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "MODEL_NOT_ENABLED");
    assert.match(payload.error.message, /not-enabled-image-model/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});

test("gateway 图片生成：火山引擎限流返回 PROVIDER_RATE_LIMITED", async () => {
  __gatewayProviderRegistryTestUtils.reset();
  const previousKey = process.env.VOLCENGINE_ARK_API_KEY;
  const previousBaseUrl = process.env.VOLCENGINE_ARK_BASE_URL;
  process.env.VOLCENGINE_ARK_API_KEY = "volcengine-secret-key-001";
  process.env.VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

  const [clientKey] = generateGatewayClientKeys(1);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "RateLimitExceeded",
          message: "too many requests",
        },
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
        },
      },
    )) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/v1/gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gateway-api-key": clientKey,
          "x-request-id": "req_test_gateway_image_rate_limited",
        },
        body: JSON.stringify({
          modality: "image",
          model: "doubao-seedream-4-5-251128",
          prompt: "生成一张商品图",
        }),
      }),
    );

    assert.equal(response.status, 429);

    const payload = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "PROVIDER_RATE_LIMITED");
    assert.match(payload.error.message, /too many requests/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOLCENGINE_ARK_API_KEY;
    } else {
      process.env.VOLCENGINE_ARK_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.VOLCENGINE_ARK_BASE_URL;
    } else {
      process.env.VOLCENGINE_ARK_BASE_URL = previousBaseUrl;
    }
  }
});
