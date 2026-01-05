#!/usr/bin/env node

/**
 * DSL文件保存脚本
 * 用于从前端接收DSL内容并保存到项目的原始路径
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'src', 'data');

// 验证文件名
function isValidFilename(filename) {
  return /^[a-zA-Z0-9_-]+\.json$/.test(filename) && !filename.includes('..');
}

// 验证JSON格式
function isValidJson(content) {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  
  if (req.method === 'PUT' && parsedUrl.pathname.startsWith('/api/save-dsl/')) {
    const filename = parsedUrl.pathname.replace('/api/save-dsl/', '');
    
    if (!isValidFilename(filename)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid filename' }));
      return;
    }
    
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const content = data.content;
        
        if (!isValidJson(content)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON content' }));
          return;
        }
        
        const filePath = path.join(DATA_DIR, filename);
        
        // 确保目录存在
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        // 写入文件
        fs.writeFileSync(filePath, content, 'utf8');
        
        console.log(`✅ DSL文件已保存: ${filename}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: `File ${filename} saved successfully`,
          path: filePath
        }));
        
      } catch (error) {
        console.error('保存文件时出错:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    
  } else if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'DSL Save Server is running' }));
    
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 DSL保存服务器已启动`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`💾 数据目录: ${DATA_DIR}`);
  console.log(`\n可用的API端点:`);
  console.log(`  PUT /api/save-dsl/{filename} - 保存DSL文件`);
  console.log(`  GET /api/health - 健康检查`);
  console.log(`\n按 Ctrl+C 停止服务器`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭DSL保存服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});