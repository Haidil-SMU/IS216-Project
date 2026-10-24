// Profile pictures. The browser crops and shrinks the image before uploading,
// so each one is small; it is stored in MongoDB, one per account.
const express = require('express');
const multer = require('multer');
const { Binary, ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { requireAuth } = require('./auth');

const MAX_BYTES = 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

// Trust the file's first bytes, not the name or the type the browser claims.
function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const pictures = () => getDb().collection('profilePictures');
const ownId = (req) => new ObjectId(req.session.userId);

const router = express.Router();

// GET: the logged-in user's picture. The URL carries ?v=<version>, so it can be cached.
router.get('/picture', requireAuth, async (req, res) => {
  const picture = await pictures().findOne({ _id: ownId(req) });
  if (!picture) return res.sendStatus(404);
  res.set({
    'Content-Type': picture.contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(Buffer.from(picture.data.buffer).subarray(0, picture.data.position));
});

// PUT: replace the picture (multipart form, field "picture").
router.put('/picture', requireAuth, (req, res) => {
  upload.single('picture')(req, res, async (error) => {
    if (error) {
      const tooBig = error.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? 'The picture must be 1 MB or smaller.' : 'Upload failed.' });
    }
    const contentType = req.file && imageType(req.file.buffer);
    if (!contentType) {
      return res.status(400).json({ error: 'Please choose a JPEG, PNG or WebP image.' });
    }

    const updatedAt = new Date();
    await pictures().replaceOne(
      { _id: ownId(req) },
      { data: new Binary(req.file.buffer), contentType, updatedAt },
      { upsert: true },
    );
    await getDb().collection('users').updateOne({ _id: ownId(req) }, { $set: { pictureUpdatedAt: updatedAt } });
    res.json({ pictureVersion: updatedAt.getTime() });
  });
});

// DELETE: go back to showing the initial.
router.delete('/picture', requireAuth, async (req, res) => {
  await pictures().deleteOne({ _id: ownId(req) });
  await getDb().collection('users').updateOne({ _id: ownId(req) }, { $unset: { pictureUpdatedAt: '' } });
  res.sendStatus(204);
});

module.exports = { router };
