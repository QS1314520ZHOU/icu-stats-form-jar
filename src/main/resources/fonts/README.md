# 中文字体配置

为了正确显示中文，请将以下字体文件放到此目录：

## 推荐字体

1. **SimSun.ttf** (宋体)
   - 最常用的中文字体
   - 文件大小约 10MB
   - Windows 系统路径：`C:\Windows\Fonts\simsun.ttc`

2. **Microsoft YaHei.ttf** (微软雅黑)
   - 现代中文字体，显示效果更好
   - Windows 系统路径：`C:\Windows\Fonts\msyh.ttc`

3. **NotoSansCJKsc-Regular.otf** (思源黑体)
   - Google 开源字体，支持简体中文
   - 下载地址：https://github.com/googlefonts/noto-cjk/releases

## 字体文件放置

将字体文件复制到此目录：

```
src/main/resources/fonts/
├── README.md
├── simsun.ttf              # 宋体（推荐）
├── Microsoft YaHei.ttf     # 微软雅黑（可选）
└── NotoSansCJKsc-Regular.otf  # 思源黑体（可选）
```

## 注意事项

1. 字体文件需要是 TTF 或 OTF 格式
2. 字体文件大小建议不超过 20MB
3. 如果没有中文字体，系统将使用 Helvetica 作为后备（中文会显示为方块）
4. 生产环境建议将字体文件打包到 JAR 中
