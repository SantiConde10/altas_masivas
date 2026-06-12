const fs = require('fs');
const path = require('path');

const CSV_MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXTENSIONS = ['.csv'];

function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist');
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Only CSV files are allowed (got ${ext})`);
  }

  // Get file stats
  const stats = fs.statSync(filePath);

  // Check if it's a symbolic link (security risk)
  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic links are not allowed');
  }

  // Check file size
  if (stats.size > CSV_MAX_SIZE) {
    throw new Error(`File exceeds maximum size of ${CSV_MAX_SIZE / 1024 / 1024}MB`);
  }

  // Get the real path (resolves symlinks and relative paths)
  const realPath = fs.realpathSync(filePath);

  // Verify the real path still matches our criteria
  const realStats = fs.statSync(realPath);
  if (realStats.size > CSV_MAX_SIZE) {
    throw new Error('File size exceeds limit');
  }

  return realPath;
}

module.exports = { validateFilePath };
