const { withCors } = require('../_lib/_cors');
const { guardApi } = require('../_lib/security');
const { translateTexts } = require('../_lib/translation');

module.exports = withCors(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!guardApi(req, res, { cost: 2 })) return;
  const { texts, targetLanguage } = req.body || {};
  if (targetLanguage !== 'en' || !Array.isArray(texts) || !texts.length || texts.length > 32 ||
      texts.some(t => typeof t !== 'string' || t.length > 2048) || texts.reduce((n, t) => n + t.length, 0) > 12000) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSLATION_REQUEST', message: 'Expected up to 32 texts (2048 characters each, 12000 total) and targetLanguage=en.' } });
  }
  try {
    const translations = await translateTexts(texts);
    return res.status(200).json({ success: true, targetLanguage: 'en', translations });
  } catch (error) {
    // Do not expose provider errors, source text, or credentials.
    return res.status(error.statusCode || 503).json({ success: false, error: {
      code: 'TRANSLATION_UNAVAILABLE', message: 'Translation unavailable. Original data is unchanged. Please retry later.'
    } });
  }
}, ['POST']);
