import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function transcribeAudio(audioBuffer) {
  const form = new FormData();
  form.append('file', Readable.from(audioBuffer), 'audio.ogg');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  const { text } = await res.json();
  return text;
}

async function executeCalendarCommand(title, date, time) {
  // Call Google Calendar API to add event
  // For now, just return success
  return { ok: true, message: '✅' };
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(404).json({ ok: false });
  }

  try {
    const { message } = req.body;

    if (!message?.voice) {
      return res.status(200).json({ ok: true });
    }

    // Download audio
    const fileId = message.voice.file_id;
    const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    const fileData = await fileRes.json();
    const filePath = fileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

    const audioRes = await fetch(downloadUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Transcribe
    const text = await transcribeAudio(audioBuffer);
    const lowerText = text.toLowerCase();

    // Execute based on keywords
    if (lowerText.includes('agéndame') || lowerText.includes('agendame')) {
      await sendTelegram('✅');
      return res.status(200).json({ ok: true });
    } else if (lowerText.includes('recuérdame') || lowerText.includes('recuerdame')) {
      await sendTelegram('✅');
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Voice handler error:', e);
    await sendTelegram(`❌ ${e.message}`);
    return res.status(500).json({ ok: false });
  }
}
