# maru-forms-mcp

MCP server cho phép AI agent tạo/sửa/đọc Google Forms qua API v1 — bao gồm branching (câu hỏi điều kiện).

---

## 👩‍💼 DÀNH CHO NGƯỜI DÙNG

Bạn không cần biết code. Chỉ cần mở Antigravity 2.0 (hoặc AI coding agent khác), **paste đoạn prompt bên dưới**, rồi làm theo khi AI hỏi.

### Paste prompt này vào Antigravity 2.0:

```
Tôi cần bạn cài đặt MCP server "maru-forms-mcp" để tôi có thể tạo và quản lý Google Forms từ đây.

Đọc file README.md trong repo https://github.com/leaddaruma-web/maru-forms-mcp — phần "DÀNH CHO AI CODING AGENT" có hướng dẫn chi tiết từng bước.

Làm hết tất cả các bước giúp tôi — bao gồm cả kiểm tra/cài Node.js nếu máy chưa có.

Hướng dẫn tôi tạo credentials.json trên Google Cloud (theo Bước 2 trong README).

Tôi chỉ cần click "Cho phép" khi trình duyệt mở ra hỏi quyền Gmail.

Bắt đầu.
```

Sau đó AI sẽ tự làm mọi thứ. Bạn chỉ cần:
- **Click "Cho phép"** khi trình duyệt mở ra hỏi quyền Gmail (1 lần duy nhất)
- **Restart Antigravity** sau khi AI báo cấu hình xong (nếu AI yêu cầu)

### Sau khi cài xong, bạn có thể bảo AI:

- *"Tạo form khảo sát mức độ hài lòng học viên"*
- *"Thêm câu hỏi trắc nghiệm: Bạn đánh giá dịch vụ mấy sao? (1-5)"*
- *"Tạo form có branching: nếu chọn 'Có' thì nhảy sang phần A, chọn 'Không' thì sang phần B"*
- *"Bật chế độ quiz, set đáp án đúng cho câu 1 là 'B'"*
- *"Đọc kết quả form [dán link Form]"*
- *"Thêm ảnh logo vào form"*
- *"Tạo câu hỏi lưới: hàng = kỹ năng, cột = Tốt/Khá/TB/Yếu"*

### Lưu ý

- **Chỉ cần cài 1 lần** — những lần sau mở Antigravity là dùng được luôn

---

## 🤖 DÀNH CHO AI CODING AGENT

> Phần này dành cho AI agent đọc và tự thực hiện. Người dùng không cần đọc phần này.

### Bước 0 — Kiểm tra và cài Node.js (nếu chưa có)

```bash
node --version
```

Nếu lệnh trên báo lỗi hoặc version < 18, cài Node.js:

- **Windows**: tải và chạy installer từ https://nodejs.org/en/download/ (chọn bản LTS, chạy file .msi, chọn tất cả mặc định). Sau khi cài xong cần mở terminal mới để `node` có trong PATH.
- **macOS**: `brew install node` hoặc tải installer từ https://nodejs.org/
- **Linux**: `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs`

Kiểm tra lại sau khi cài:
```bash
node --version  # phải >= 18
npm --version   # phải có
```

### Bước 1 — Clone repo

```bash
git clone https://github.com/leaddaruma-web/maru-forms-mcp.git
cd maru-forms-mcp
```

Nếu máy chưa có git:
- **Windows**: tải từ https://git-scm.com/download/win, cài mặc định
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt-get install git`

### Bước 2 — Tạo file credentials.json

File này chứa thông tin OAuth client — **không có trong repo** (bảo mật). Người dùng tự tạo trên Google Cloud (miễn phí).

**BÁO CHO NGƯỜI DÙNG:** "Bạn cần tạo credentials trên Google Cloud — miễn phí, chỉ mất 3 phút. Tôi sẽ hướng dẫn từng bước, bạn chỉ cần click theo."

Hướng dẫn người dùng mở trình duyệt và làm theo:

**Bước 2.1. Tạo Google Cloud project:**
- Mở https://console.cloud.google.com/
- Đăng nhập bằng Gmail sẽ dùng để tạo/quản lý Form
- Click menu dropdown project ở thanh trên (cạnh logo Google Cloud) → "New Project"
- Đặt tên project: `maru-forms-mcp` → click "Create"
- Đợi vài giây, chọn project vừa tạo từ dropdown

**Bước 2.2. Bật Google Forms API + Drive API:**
- Mở https://console.cloud.google.com/apis/library/forms.googleapis.com
- Click "Enable" (Bật)
- Mở thêm https://console.cloud.google.com/apis/library/drive.googleapis.com
- Click "Enable" (Bật)

**Bước 2.3. Cấu hình OAuth consent screen:**
- Mở https://console.cloud.google.com/apis/credentials/consent
- Chọn "External" → click "Create"
- Điền:
  - App name: `maru-forms-mcp`
  - User support email: chọn Gmail của bạn
  - Developer contact: nhập Gmail của bạn
- Click "Save and Continue" qua các bước còn lại (Scopes, Test users) → click "Back to Dashboard"
- Ở trang Consent screen, click "Publish App" nếu muốn dùng lâu dài (nếu chỉ test thì bỏ qua)

**Bước 2.4. Tạo OAuth Client ID:**
- Mở https://console.cloud.google.com/apis/credentials
- Click "+ Create Credentials" → "OAuth client ID"
- Application type: chọn **"Desktop app"**
- Name: `maru-forms-mcp`
- Click "Create"
- **MÀN HÌNH HIỆN RA CLIENT ID VÀ CLIENT SECRET** — copy cả 2 giá trị này

**Bước 2.5. Tạo file credentials.json:**

Tạo file `credentials.json` ở thư mục gốc repo (`maru-forms-mcp/credentials.json`) với nội dung:

```json
{
  "installed": {
    "client_id": "THAY_CLIENT_ID_VAO_DAY",
    "project_id": "maru-forms-mcp",
    "client_secret": "THAY_CLIENT_SECRET_VAO_DAY",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "redirect_uris": ["http://localhost:4573/oauth2callback"]
  }
}
```

Thay `THAY_CLIENT_ID_VAO_DAY` và `THAY_CLIENT_SECRET_VAO_DAY` bằng giá trị vừa copy ở Bước 2.4.

**BÁO CHO NGƯỜI DÙNG:** "Xong bước tạo credentials! Tiếp tục cài đặt nhé."

### Bước 3 — Cài dependencies

```bash
npm install
```

### Bước 4 — Xác thực Gmail (chỉ 1 lần)

```bash
npm run auth
```

Lệnh này sẽ:
1. Mở trình duyệt tại URL xác thực Google
2. Người dùng đăng nhập Gmail và click "Cho phép" / "Allow"
3. Trình duyệt chuyển hướng về localhost:4573 → file `token.json` được tạo tự động

**BÁO CHO NGƯỜI DÙNG:** "Trình duyệt sẽ mở ra — bạn đăng nhập Gmail rồi click Cho phép nhé."

Đợi cho đến khi terminal hiện `✓ Đã lưu token.json` rồi tiếp tục.

### Bước 5 — Cấu hình MCP server

Thêm vào file cấu hình MCP của tool đang dùng:

**Claude Code** — file `claude_desktop_config.json` hoặc `.claude.json`:
```json
{
  "mcpServers": {
    "maru-forms": {
      "command": "node",
      "args": ["src/forms-server.js"],
      "cwd": "<đường-dẫn-tuyệt-đối-tới-thư-mục-maru-forms-mcp>"
    }
  }
}
```

**Antigravity 2.0** — vào Settings → MCP Servers → thêm server mới:
- Name: `maru-forms`
- Command: `node`
- Arguments: `src/forms-server.js`
- Working directory: `<đường-dẫn-tuyệt-đối-tới-thư-mục-maru-forms-mcp>`

### Bước 6 — Kiểm tra

Sau khi cấu hình, restart tool rồi thử:
- Gọi tool `create_form` với title bất kỳ
- Nếu trả về link form → **thành công**

**BÁO CHO NGƯỜI DÙNG:** "Đã cài xong! Bạn có thể restart Antigravity rồi thử bảo tôi tạo Form."

### Các tool có sẵn sau khi cài

| Tool | Mô tả | Tham số chính |
|------|--------|---------------|
| `create_form` | Tạo form mới | title, isQuiz, folderId |
| `get_form` | Đọc cấu trúc form (câu hỏi, sections, branching) | formId |
| `add_question` | Thêm câu hỏi (8 loại + branching + quiz) | formId, title, type, options |
| `add_section` | Thêm section (ngắt trang) cho branching | formId, title |
| `add_text_item` | Thêm đoạn text mô tả | formId, title |
| `add_image_item` | Thêm ảnh | formId, imageUrl |
| `add_grid_question` | Thêm câu hỏi lưới (hàng × cột) | formId, rows, columns |
| `update_item` | Sửa câu hỏi/item | formId, itemId, title, options |
| `delete_item` | Xoá item | formId, itemId |
| `move_item` | Đổi vị trí item | formId, itemId, newIndex |
| `update_form_info` | Sửa tiêu đề/mô tả form | formId, title, description |
| `set_quiz` | Bật/tắt chế độ quiz | formId, isQuiz |
| `list_responses` | Đọc danh sách câu trả lời | formId, limit |
| `get_response` | Đọc chi tiết 1 response | formId, responseId |
| `batch_update` | Gửi nhiều request cùng lúc | formId, requests |

### Cách tạo Branching (câu hỏi điều kiện)

Branching = tuỳ theo câu trả lời mà nhảy đến section khác nhau.

**Ví dụ:** "Bạn là học viên hay phụ huynh?" → Học viên → Section A | Phụ huynh → Section B

```
Bước 1: Tạo 2 section (add_section)
  → Section A "Dành cho học viên" → nhận itemId: "abc123"
  → Section B "Dành cho phụ huynh" → nhận itemId: "def456"

Bước 2: Tạo câu hỏi RADIO với goToSectionId (add_question)
  type: "RADIO"
  options: [
    { value: "Học viên", goToSectionId: "abc123" },
    { value: "Phụ huynh", goToSectionId: "def456" }
  ]
```

Các goToAction có sẵn:
- `NEXT_SECTION` — tiếp tục section kế (mặc định)
- `RESTART_FORM` — quay lại đầu form
- `SUBMIT_FORM` — nộp form ngay

### Loại câu hỏi hỗ trợ

| Type | Mô tả | Cần options? |
|------|--------|-------------|
| `SHORT_TEXT` | Text ngắn 1 dòng | Không |
| `PARAGRAPH` | Text dài nhiều dòng | Không |
| `RADIO` | Trắc nghiệm 1 đáp án | ✅ Có |
| `CHECKBOX` | Chọn nhiều đáp án | ✅ Có |
| `DROP_DOWN` | Dropdown 1 đáp án | ✅ Có |
| `SCALE` | Thang điểm (vd 1-5) | Không (dùng scaleLow/scaleHigh) |
| `DATE` | Chọn ngày | Không |
| `TIME` | Chọn giờ | Không |

Grid (lưới) dùng tool riêng `add_grid_question`.

### Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| `Chưa có token.json` | Chưa chạy auth | `npm run auth` |
| `PERMISSION_DENIED` | Forms API chưa bật | Bật tại https://console.cloud.google.com/apis/library/forms.googleapis.com |
| `node: command not found` | Chưa cài Node.js | Cài Node.js theo Bước 0 |
| `ECONNREFUSED` / `invalid_grant` | Token hết hạn | Xoá `token.json`, chạy lại `npm run auth` |
| `Không tìm thấy item` | itemId sai | Dùng `get_form` xem lại danh sách itemId |
