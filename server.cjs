const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

// 创建自定义错误类来避免__dirname问题
class SaveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SaveError';
  }
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API endpoint to save JSON files
app.post('/api/save-json', async (req, res) => {
  try {
    const { file } = req.query;
    const content = req.body;

    if (!file) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Security check: only allow saving to datav3 directory
    const normalizedPath = path.normalize(file);
    if (!normalizedPath.includes('datav3')) {
      return res.status(403).json({ error: 'Only datav3 directory is allowed' });
    }

    // Ensure the file is within the project directory
    const absolutePath = path.resolve(process.cwd(), normalizedPath);
    const projectRoot = process.cwd();

    console.log('Saving file:', {
      requestedFile: file,
      normalizedPath: normalizedPath,
      absolutePath: absolutePath,
      projectRoot: projectRoot,
      cwd: process.cwd()
    });

    if (!absolutePath.startsWith(projectRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file - content is already a string from JSON body
    const contentString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(absolutePath, contentString, 'utf8');

    console.log(`File saved: ${absolutePath}`);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Error saving file:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);

    // 总是返回通用错误信息，不暴露内部错误详情
    res.status(500).json({ error: 'Failed to save file', details: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});