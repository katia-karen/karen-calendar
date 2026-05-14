import fetch from 'node-fetch';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(404).json({ ok: false });
  }

  try {
    const { message } = req.body;
    
    if (!message?.voice) {
      return res.status(200).json({ ok: true });
    }

    // Download audio from Telegram
    const fileId = message.voice.file_id;
    const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    const fileData = await fileRes.json();
    const filePath = fileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

    // Download audio file
    const audioRes = await fetch(downloadUrl);
    const audioBuffer = await audioRes.buffer();

    // Send to Whisper
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg');
    formData.append('model', 'whisper-1');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    const { text } = await whisperRes.json();
    
    // Transform text: "karen agendame..." → "; agendame..."
    let transformedText = text.toLowerCase();
    transformedText = transformedText.replace(/^karen\s+(agéndame|agendame)/i, '; agéndame');
    transformedText = transformedText.replace(/^karen\s+(recuérdame|recuerdame)/i, '; recuérdame');

    // Send back to Telegram as text (so webhook processes it)
    const sendUrl = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: message.chat.id, text: transformedText }),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Whisper error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
