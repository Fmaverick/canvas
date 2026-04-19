curl --request GET \
  --url https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/$TASK_ID \
  --header 'Accept: */*' \
  --header 'Accept-Encoding: gzip, deflate, br' \
  --header 'Authorization: Bearer $VOLCENGINE_ARK_VIDEO_API_KEY' \
  --header 'Connection: keep-alive' \
  --header 'Content-Type: application/json' \
  --header 'User-Agent: PostmanRuntime-ApipostRuntime/1.1.0'

{
	"id": "$TASK_ID",
	"model": "$VOLCENGINE_ARK_VIDEO_MODEL",
	"status": "succeeded",
	"content": {
		"video_url": "<SIGNED_VIDEO_URL>"
	},
	"usage": {
		"completion_tokens": 411300,
		"total_tokens": 411300
	},
	"created_at": 1776612580,
	"updated_at": 1776612986,
	"seed": 99719,
	"resolution": "720p",
	"ratio": "16:9",
	"duration": 11,
	"framespersecond": 24,
	"service_tier": "default",
	"execution_expires_after": 172800,
	"generate_audio": true,
	"draft": false
}
