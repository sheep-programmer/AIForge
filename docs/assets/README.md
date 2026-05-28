# Brand assets

| 文件 | 用途 | 由谁引用 |
|------|------|---------|
| `hero.png` | 仓库主页顶部 banner | `/README.md` · `/README.en.md` |
| `hero.svg` | `hero.png` 的源文件，改动设计后用它重导出 | 离线工具 |
| `web-screenshot.png` | README 内 Web 管理面板示意图 | `/README.md` · `/README.en.md` |
| `web-screenshot.svg` | `web-screenshot.png` 的源文件 | 离线工具 |
| `social-preview.png` | GitHub Settings → Social preview 上传图（1280×640） | 手动在 web UI 上传 |

## 为什么 README 用 PNG 而不是 SVG

GitHub 在渲染 README 时会把相对路径的 `<img>` 走 Camo 图床代理。Camo 会把 SVG 里的 SMIL 动画 / 部分 filter 剥掉，常导致图渲染不出或样式异常。**用 PNG 最稳。**

## 重导出

PNG 用 `sharp` 从 SVG 渲染，2× 密度：

```bash
cd ../../web
node -e "
const sharp = require('sharp');
const fs = require('fs');
const jobs = [
  { in: '../docs/assets/hero.svg',           out: '../docs/assets/hero.png',           w: 2560, h: 720 },
  { in: '../docs/assets/web-screenshot.svg', out: '../docs/assets/web-screenshot.png', w: 2560, h: 1520 },
];
Promise.all(jobs.map(j => sharp(fs.readFileSync(j.in), { density: 288 }).resize(j.w, j.h).png({ compressionLevel: 9 }).toFile(j.out)));
"
```
