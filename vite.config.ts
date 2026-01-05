import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import fs from "fs"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "generate-json-files-list",
      buildStart() {
        const datav3Path = path.resolve(__dirname, "./src/datav3")
        const outputPath = path.resolve(__dirname, "./src/generated/json-files.ts")

        // 递归获取所有 JSON 文件
        function getJsonFiles(dir: string, baseDir: string = ""): string[] {
          const files: string[] = []
          const items = fs.readdirSync(dir, { withFileTypes: true })

          for (const item of items) {
            const fullPath = path.join(dir, item.name)

            if (item.isDirectory()) {
              files.push(...getJsonFiles(fullPath, ""))
            } else if (item.name.endsWith(".json")) {
              files.push(item.name.replace(/\.json$/, ""))
            }
          }

          return files
        }

        const jsonFiles = getJsonFiles(datav3Path)

        // 生成 TypeScript 文件内容
        const content = `// This file is auto-generated during build process
// Do not edit manually

export const JSON_FILES = ${JSON.stringify(jsonFiles, null, 2)} as const
`

        // 确保目录存在
        const outputDir = path.dirname(outputPath)
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
        }

        // 写入文件
        fs.writeFileSync(outputPath, content)
        console.log(`Generated JSON files list: ${jsonFiles.length} files found`)
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})