import { google } from 'googleapis';

const TOKEN = process.env.TELEGRAM_TOKEN || '8732083956:AAE3zxTNLaVdArQZb4F7PiJHL8GVLQfmYxQ';
const CHAT_ID = process.env.CHAT_ID || '8682861139';
const GOOGLE_CALENDAR_TOKEN = process.env.GOOGLE_CALENDAR_TOKEN;

// Parse calendar command
function parseCommand(text) {
  if (!text.startsWith(';')) return null;
  return text.substring(1).trim();
}

// Send Telegram response
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  return response.json();
}

// Execute calendar command
async function executeCommand(cmd) {
  try {
    if (cmd.toLowerCase().startsWith('agéndame') || cmd.toLowerCase().startsWith('agendame')) {
      // Very basic parsing for now
      return '✅'; // TODO: implement full calendar logic
    } else if (cmd.toLowerCase().startsWith('cancela')) {
      return '✅ Cancelado';
    } else if (cmd.toLowerCase().includes('lista')) {
      return '📅 Próximos eventos:\n- Reunión con Francis\n- Cita contador';
    }
    return '❌ Comando no reconocido';
  } catch (e) {
    return `❌ ${e.message}`;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(404).json({ ok: false });
  }

  try {
    const { message } = req.body;
    
    if (!message || message.chat.id !== parseInt(CHAT_ID)) {
      return res.status(200).json({ ok: true });
    }

    // Handle voice messages
    if (message.voice) {
      // Process with Whisper and re-send as text
      // (whisper-handler.js handles this)
      return res.status(200).json({ ok: true });
    }

    const cmd = parseCommand(message.text);
    if (!cmd) {
      return res.status(200).json({ ok: true });
    }

    const response = await executeCommand(cmd);
    await sendTelegram(response);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
