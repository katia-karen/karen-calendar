import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function executeVoiceNative(audioBuffer) {
  // Save audio to temp file
  const tmpFile = `/tmp/voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.ogg`;
  fs.writeFileSync(tmpFile, audioBuffer);

  try {
    // Call voice-native skill (fire and forget)
    const skillPath = '/Users/mac/.openclaw/workspace/skills/voice-native/scripts/transcribe-and-execute.js';
    execSync(`OPENAI_API_KEY="${OPENAI_API_KEY}" node "${skillPath}" "${tmpFile}"`, {
      stdio: 'ignore',
      timeout: 30000,
    });
  } catch (e) {
    // Skill handles errors silently
  } finally {
    // Cleanup
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
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

    // Respond immediately (no await)
    res.status(200).json({ ok: true });

    // Process in background (fire and forget)
    (async () => {
      try {
        // Download audio
        const fileId = message.voice.file_id;
        const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
        const fileRes = await fetch(getFileUrl);
        const fileData = await fileRes.json();
        const filePath = fileData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

        const audioRes = await fetch(downloadUrl);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        // Execute via voice-native skill
        await executeVoiceNative(audioBuffer);
      } catch (e) {
        // Silent failure
      }
    })();
  } catch (e) {
    console.error('Voice handler error:', e);
    return res.status(500).json({ ok: false });
  }
}
