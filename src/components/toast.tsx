export function showToast(msg: string, ms = 2000) {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:20px;
    background:#dcfce7;color:#016630;padding:6px 10px;
    border-radius:4px;z-index:9999;
    animation:fadeIn 0.3s ease;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), ms)
}

// 添加动画
const style = document.createElement('style')
style.textContent = `@keyframes fadeIn{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}`
document.head.appendChild(style)