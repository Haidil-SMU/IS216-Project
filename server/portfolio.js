// A contractor's portfolio: named past projects, each with its own photos. The contractor
// manages it from their dashboard, and homeowners open it from View Portfolio in Find
// Contractors. The browser shrinks each photo before uploading, so they are stored in MongoDB.
const express = require('express');
const multer = require('multer');
const { Binary, ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { requireContractor } = require('./auth');
const { findProfile } = require('./contractor');
const { imageType } = require('./profile');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PROJECTS = 10;
const MAX_CAPTION = 100;
const MAX_NAME = 40; // fits in two lines on the project's cover card

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 2 },
});

const projects = () => getDb().collection('portfolioProjects');
const photos = () => getDb().collection('projectPhotos');
const cleanCaption = (value) => String(value || '').trim().slice(0, MAX_CAPTION);
const toId = (value) => (ObjectId.isValid(value) ? new ObjectId(value) : null);

// Returns { name } or { error } with a message for the form.
function validateName(value) {
  // Line breaks the contractor typed are kept; spaces are tidied and blank lines dropped.
  const name = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (name.length < 2 || name.length > MAX_NAME) {
    return { error: `Please enter a project name (2 to ${MAX_NAME} characters).` };
  }
  return { name };
}

// Everything but the image bytes, plus the address the image is served from.
// A photo's bytes never change, so the URL can be cached for good.
function describePhoto(photo) {
  return {
    _id: photo._id,
    caption: photo.caption,
    createdAt: photo.createdAt,
    url: `/api/contractors/${photo.contractorId}/photos/${photo._id}`,
  };
}

// The contractor's projects, newest first, each with its photos in upload order.
async function listFor(contractorId) {
  const list = await projects().find({ contractorId }).sort({ createdAt: -1 }).toArray();
  const allPhotos = await photos()
    .find({ projectId: { $in: list.map((project) => project._id) } }, { projection: { data: 0 } })
    .sort({ createdAt: 1 })
    .toArray();

  return list.map((project) => ({
    _id: project._id,
    name: project.name,
    createdAt: project.createdAt,
    photos: allPhotos.filter((photo) => photo.projectId.equals(project._id)).map(describePhoto),
  }));
}

// ============================================================
// The logged-in contractor's own portfolio (/api/contractor/projects)
// ============================================================

const ownRouter = express.Router();
ownRouter.use(requireContractor);

// The portfolio always belongs to the logged-in contractor's own profile.
ownRouter.use(async (req, res, next) => {
  req.contractorProfile = await findProfile(req);
  if (!req.contractorProfile) {
    return res.status(403).json({ error: 'Please set up your business profile first.' });
  }
  next();
});

// Finds one of this contractor's projects from :projectId, or answers 404.
async function ownProject(req, res, next) {
  const _id = toId(req.params.projectId);
  req.project = _id && (await projects().findOne({ _id, contractorId: req.contractorProfile._id }));
  if (!req.project) return res.status(404).json({ error: 'Project not found.' });
  next();
}

const ownPhotoFilter = (req) => ({ _id: toId(req.params.photoId), projectId: req.project._id });

ownRouter.get('/', async (req, res) => {
  res.json({
    projects: await listFor(req.contractorProfile._id),
    maxProjects: MAX_PROJECTS,
  });
});

// POST: start a new project ({ name }); photos are added to it afterwards.
ownRouter.post('/', async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ error });

  const contractorId = req.contractorProfile._id;
  if ((await projects().countDocuments({ contractorId })) >= MAX_PROJECTS) {
    return res.status(400).json({ error: `You can show up to ${MAX_PROJECTS} projects. Delete one first.` });
  }

  const project = { contractorId, name, createdAt: new Date() };
  const result = await projects().insertOne(project);
  res.status(201).json({ project: { _id: result.insertedId, name, createdAt: project.createdAt, photos: [] } });
});

// PATCH: rename a project.
ownRouter.patch('/:projectId', ownProject, async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ error });
  await projects().updateOne({ _id: req.project._id }, { $set: { name } });
  res.json({ name });
});

// DELETE: remove a project and all its photos.
ownRouter.delete('/:projectId', ownProject, async (req, res) => {
  await photos().deleteMany({ projectId: req.project._id });
  await projects().deleteOne({ _id: req.project._id });
  res.sendStatus(204);
});

// POST: add one photo to a project (multipart form, field "photo", optional "caption").
ownRouter.post('/:projectId/photos', ownProject, (req, res) => {
  upload.single('photo')(req, res, async (error) => {
    if (error) {
      const tooBig = error.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? 'Each photo must be 2 MB or smaller.' : 'Upload failed.' });
    }
    const contentType = req.file && imageType(req.file.buffer);
    if (!contentType) {
      return res.status(400).json({ error: 'Please choose a JPEG, PNG or WebP image.' });
    }

    const photo = {
      contractorId: req.contractorProfile._id,
      projectId: req.project._id,
      data: new Binary(req.file.buffer),
      contentType,
      caption: cleanCaption(req.body.caption),
      createdAt: new Date(),
    };
    const result = await photos().insertOne(photo);
    res.status(201).json({ photo: describePhoto({ ...photo, _id: result.insertedId }) });
  });
});

// PATCH: change a photo's caption.
ownRouter.patch('/:projectId/photos/:photoId', ownProject, async (req, res) => {
  const photo = await photos().findOneAndUpdate(
    ownPhotoFilter(req),
    { $set: { caption: cleanCaption(req.body?.caption) } },
    { returnDocument: 'after', projection: { data: 0 } },
  );
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  res.json({ photo: describePhoto(photo) });
});

ownRouter.delete('/:projectId/photos/:photoId', ownProject, async (req, res) => {
  const result = await photos().deleteOne(ownPhotoFilter(req));
  if (!result.deletedCount) return res.status(404).json({ error: 'Photo not found.' });
  res.sendStatus(204);
});

// ============================================================
// Any contractor's portfolio, as homeowners see it (/api/contractors/:id/...)
// ============================================================

const publicRouter = express.Router();

// Projects without photos yet are left out.
publicRouter.get('/:contractorId/projects', async (req, res) => {
  const contractorId = toId(req.params.contractorId);
  if (!contractorId) return res.status(404).json({ error: 'Contractor not found.' });
  const list = await listFor(contractorId);
  res.json({ projects: list.filter((project) => project.photos.length) });
});

publicRouter.get('/:contractorId/photos/:photoId', async (req, res) => {
  const contractorId = toId(req.params.contractorId);
  const _id = toId(req.params.photoId);
  const photo = contractorId && _id && (await photos().findOne({ _id, contractorId }));
  if (!photo) return res.sendStatus(404);
  res.set({
    'Content-Type': photo.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(Buffer.from(photo.data.buffer).subarray(0, photo.data.position));
});

module.exports = { ownRouter, publicRouter };
