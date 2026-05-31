# Telegram Bot Setup Guide

Step-by-step guide to connect a Telegram bot to the AI Agent Orchestration Platform.

---

## Prerequisites

- Platform running and accessible via a public HTTPS URL (e.g. ngrok or a hosted domain)
- A Telegram account

---

## Step 1 — Create a Bot with BotFather

1. Open Telegram → search for `@BotFather`
2. Send `/newbot`
3. Enter a display name (e.g. `My AI Agent`)
4. Enter a username ending in `bot` (e.g. `myaiagent_bot`)
5. Copy the **Bot Token** BotFather gives you:
   ```
   123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
   ```

---

## Step 2 — Add the Bot in Settings UI

1. Go to `https://<your-host>/settings`
2. Click **Add Bot**
3. **Wizard Step 1:** Enter a bot name, select **Telegram**
4. **Wizard Step 2:** Paste the Bot Token from BotFather
5. **Wizard Step 3:** Note the generated webhook URL — you'll use it in Step 4

The platform creates the bot and stores the token encrypted in the database.

---

## Step 3 — Get Your Bot's UUID

If the UUID is not visible in the UI, fetch it from the API:

```bash
curl https://<your-host>/bots
```

Response:
```json
[{
  "id": "b8640fda-0621-41ad-a0ee-45f22953965b",
  "name": "crypto",
  "channel_type": "telegram",
  "enabled": true
}]
```

Copy the `id` value — this is your bot UUID.

---

## Step 4 — Register the Webhook with Telegram

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-host>/telegram/webhook/<BOT_UUID>"
```

Expected response:
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

Verify:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

---

## Step 5 — Get Your Telegram Chat ID

Since the webhook is now active, `getUpdates` will return a 409 conflict. Use this workaround:

```bash
# 1. Temporarily delete the webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"

# 2. Open Telegram and send any message (e.g. /start) to your bot

# 3. Fetch updates to get your chat ID
curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates"
```

Look for `chat.id` in the response:
```json
{
  "message": {
    "chat": {
      "id": 625882718,
      "type": "private"
    },
    "text": "/start"
  }
}
```

```bash
# 4. Re-register the webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-host>/telegram/webhook/<BOT_UUID>"
```

### Chat ID by Type

| Chat Type | ID Format | Example |
|-----------|-----------|---------|
| Private (DM with bot) | Positive number | `625882718` |
| Group chat | Negative number | `-987654321` |
| Supergroup / Channel | Starts with -100 | `-1001234567890` |

For a group: add your bot to the group, send a message, then follow the steps above.

---

## Step 6 — Map Chat ID to a Workflow

1. Go to `https://<your-host>/settings`
2. Open your bot card → click **Add Mapping**
3. Enter your **Chat ID** (e.g. `625882718`)
4. Select a **Workflow** from the dropdown
5. Click **Save**

The platform stores the `chat_id → workflow_id` mapping in the database.

---

## How It Works End-to-End

```
User sends message in Telegram
        ↓
Telegram POSTs to /telegram/webhook/{bot_uuid}
        ↓
Backend looks up chat_id in telegram_chat_mappings
        ↓
Executes the mapped Workflow (LangGraph agent)
        ↓
Result sent back via Telegram sendMessage API
        ↓
User receives reply in Telegram
```

---

## Important: ngrok URLs Are Temporary

If you're using ngrok, the URL changes every time you restart it. When that happens:

1. Get the new ngrok URL
2. Re-run the `setWebhook` curl command with the new URL
3. No need to recreate the bot in Settings — just update the webhook

For production, use a stable domain with a fixed URL.
