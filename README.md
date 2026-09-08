# Trình đọc RSS

Plugin Obsidian để đọc RSS / Atom và file Markdown trong kho.

- Bài tiếng Anh và tiếng Việt hiện nguyên văn.
- Bài tiếng Trung được dịch sang tiếng Việt khi đọc.
- Có thể ghi tiêu đề bài vào nhật ký hôm nay.

Cần Obsidian **1.13.0** trở lên.

## Cài đặt

### Trong Obsidian

Sau khi plugin có trên danh mục chính thức, vào **Settings → Community plugins**, tìm **Vietnam AI RSS**, rồi bật.

### Cài thủ công

1. Tải `main.js`, `manifest.json`, `styles.css` từ [Releases](https://github.com/mrtinhnguyen/vietnam-ai-rss/releases).
2. Tạo thư mục `<kho>/.obsidian/plugins/vietnam-ai-rss/`.
3. Đặt ba file vào thư mục đó.
4. Bật **Vietnam AI RSS** trong Community plugins.
5. Bấm biểu tượng RSS, hoặc chạy lệnh **Mở trình đọc RSS**.

### BRAT

Thêm kho `mrtinhnguyen/vietnam-ai-rss`, rồi bật plugin.

## Cách dùng

1. Bấm **+** để thêm địa chỉ RSS / Atom, hoặc mở **Khám phá** để chọn nguồn có sẵn.
2. Chọn kênh ở đầu danh sách. Có thể nhóm nguồn, nhập và xuất OPML.
3. Mở bài để đọc. Nếu là tiếng Trung, plugin tự dịch sang tiếng Việt. Có thể chuyển về **Bản gốc**.
4. Bấm biểu tượng sổ tay để ghi bài vào nhật ký hôm nay. Chọn một đoạn chữ để trích vào nhật ký hoặc ghi chú đang mở.

Ảnh tải về bộ nhớ đệm trong kho. Dữ liệu đã đọc, đã lưu và đăng ký chỉ nằm trong kho này, không gửi ghi chú đi đâu.

## Phát triển

```sh
npm ci
npm run build
```

`npm run build` tạo `main.js` ở thư mục gốc. Cài cùng `manifest.json` và `styles.css`.

Giấy phép: [GPL-3.0-only](LICENSE).
