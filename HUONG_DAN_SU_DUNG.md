# 🥋 HƯỚNG DẪN SỬ DỤNG PHẦN MỀM KARATE TOURNAMENT MANAGER

> **Phiên bản:** 1.0.0  
> **Tác giả:** Trương Lưu Quân - 0336.440.523  
> **Dành cho:** Người mới bắt đầu sử dụng phần mềm

---

## 📋 MỤC LỤC

1. [Giới thiệu phần mềm](#1-giới-thiệu-phần-mềm)
2. [Cài đặt & Khởi động](#2-cài-đặt--khởi-động)
3. [Màn hình chọn vai trò](#3-màn-hình-chọn-vai-trò)
4. [Hướng dẫn cho ADMIN](#4-hướng-dẫn-cho-admin)
5. [Hướng dẫn cho HUẤN LUYỆN VIÊN (HLV)](#5-hướng-dẫn-cho-huấn-luyện-viên-hlv)
6. [Hướng dẫn cho THƯ KÝ](#6-hướng-dẫn-cho-thư-ký)
7. [Quy trình tổ chức giải đấu hoàn chỉnh](#7-quy-trình-tổ-chức-giải-đấu-hoàn-chỉnh)
8. [Câu hỏi thường gặp (FAQ)](#8-câu-hỏi-thường-gặp-faq)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)

---

## 1. GIỚI THIỆU PHẦN MỀM

**Karate Tournament Manager** là phần mềm quản lý giải đấu Karate chuyên nghiệp, hỗ trợ:

- ✅ Tạo và quản lý giải đấu
- ✅ Quản lý danh sách vận động viên (VĐV)
- ✅ Bốc thăm tự động (phân nhánh, tránh cùng CLB, hạt giống)
- ✅ Hiển thị sơ đồ thi đấu (Bracket)
- ✅ Bấm điểm trận đấu (Kumite & Kata)
- ✅ Xuất PDF sơ đồ thi đấu
- ✅ Hoạt động **100% offline** - không cần internet

### Phần mềm có 3 vai trò:

| Vai trò | Biểu tượng | Chức năng chính |
|---------|-----------|-----------------|
| **Admin** | 👨‍💼 | Quản lý toàn bộ giải đấu, bốc thăm, xuất file |
| **Huấn luyện viên (HLV)** | 🏆 | Nhập danh sách VĐV, gửi cho Admin |
| **Thư ký** | 🎯 | Bấm điểm trận đấu, xuất kết quả |

---

## 2. CÀI ĐẶT & KHỞI ĐỘNG

### 2.1. Cài đặt

1. Mở file cài đặt `Karate Tournament Manager Setup 1.0.0.exe`
2. Làm theo hướng dẫn cài đặt trên màn hình
3. Chọn thư mục cài đặt (mặc định là `C:\Program Files\Karate Tournament Manager`)
4. Nhấn **Install** để bắt đầu cài đặt
5. Sau khi cài xong, nhấn **Finish**

### 2.2. Khởi động

- Tìm biểu tượng **Karate Tournament Manager** trên Desktop hoặc trong Start Menu
- Nhấp đúp để mở phần mềm
- Phần mềm sẽ hiển thị **màn hình License** trước, chờ vài giây hoặc nhấn để bỏ qua
- Sau đó hiển thị **màn hình chọn vai trò**

---

## 3. MÀN HÌNH CHỌN VAI TRÒ

Khi mở phần mềm, bạn sẽ thấy 3 thẻ (card) để chọn vai trò:

### 👨‍💼 Admin
> Dành cho **Ban tổ chức** - người quản lý toàn bộ giải đấu

### 🎯 Thư ký  
> Dành cho **Thư ký trận đấu** - người bấm điểm các trận

### 🏆 Huấn luyện viên
> Dành cho **HLV các đội** - nhập danh sách VĐV

**👉 Nhấn vào thẻ tương ứng để vào hệ thống với vai trò đó.**

---

## 4. HƯỚNG DẪN CHO ADMIN

Admin là vai trò chính, quản lý toàn bộ giải đấu. Đây là vai trò dành cho **Ban tổ chức**.

### 4.1. Tạo giải đấu mới

1. Từ trang chủ Admin, nhấn nút **"Tạo giải đấu mới"**
2. Điền thông tin:
   - **Tên giải đấu** *(bắt buộc)*: VD: "Vô địch Karate Quốc gia 2026"
   - **Ngày bắt đầu**: Ngày bắt đầu giải (DD/MM/YYYY)
   - **Ngày kết thúc**: Ngày kết thúc giải
   - **Địa điểm**: VD: "Nhà thi đấu Quốc gia, Hà Nội"
3. Nhấn **"Tạo giải đấu"**
4. Giải đấu mới sẽ xuất hiện trên trang chủ

### 4.2. Quản lý hạng mục thi đấu

Sau khi tạo giải đấu, nhấn **"Mở giải đấu →"** để vào trang chi tiết.

#### Thêm hạng mục thủ công:
1. Nhấn **"+ Thêm hạng mục"**
2. Điền thông tin:
   - **Tên hạng mục**: VD: "Kumite Nam -60kg"
   - **Nội dung**: Kumite (Đối kháng) hoặc Kata (Quyền)
   - **Giới tính**: Nam / Nữ / Hỗn hợp
   - **Hạng cân**: VD: "-60kg" (chỉ cho Kumite)
   - **Lứa tuổi**: VD: "U18", "Senior"
   - **Thể thức**: Loại trực tiếp hoặc Có vòng đấu vớt
3. Nhấn **"Thêm hạng mục"**

#### Import hạng mục từ Excel:
1. Nhấn **"📥 Tải mẫu Excel"** để tải file mẫu
2. Mở file mẫu và điền danh sách hạng mục theo hướng dẫn trong file
3. Nhấn **"📤 Import từ Excel"** và chọn file đã điền
4. Hệ thống sẽ tự động tạo các hạng mục từ file

### 4.3. Quản lý vận động viên

Nhấn **"Quản lý →"** ở hạng mục bất kỳ để vào trang quản lý VĐV.

#### Thêm VĐV thủ công:
1. Nhấn **"+ Thêm VĐV"**
2. Điền thông tin:
   - **Tên VĐV** *(bắt buộc)*
   - **Giới tính** *(bắt buộc)*
   - **Ngày sinh**
   - **Đơn vị / CLB**
   - **Cân nặng** (cho Kumite)
   - **Quốc gia**
   - **Thi đấu đồng đội** (check nếu thi đồng đội)
   - **Hạt giống** (1-8, nếu có)
3. Nhấn **"Thêm VĐV"**

#### Import VĐV từ Excel:
1. Nhấn **"📥 Tải mẫu Excel"** để tải file mẫu VĐV
2. Điền danh sách VĐV vào file mẫu theo cột:
   - Cột A: Tên VĐV
   - Cột B: Giới tính (Nam/Nữ)
   - Cột C: Ngày sinh (DD/MM/YYYY)
   - Cột D: Đơn vị/CLB
   - Cột E: Cân nặng (kg)
   - Cột F: Quốc gia (mặc định VN)
   - Cột G: Đồng đội (Có/Không)
   - Cột H: Hạt giống (1-8)
3. Nhấn **"📤 Import Excel"** và chọn file
4. Hệ thống thông báo số VĐV import thành công

### 4.4. Bốc thăm tự động

> ⚠️ Cần ít nhất **2 VĐV** mới có thể bốc thăm

1. Vào trang hạng mục cần bốc thăm
2. Nhấn nút **"🎲 Bốc thăm"**
3. Hệ thống hiển thị thông tin xác nhận:
   - Số VĐV
   - Số slots dự kiến
   - Số BYE (lượt trống)
   - Số hạt giống
4. Nhấn **"🎲 Bốc thăm ngay"**
5. **Đếm ngược 5 giây** với hiệu ứng xáo trộn tên VĐV
6. Sau 5 giây → Tự động chuyển sang trang **Sơ đồ thi đấu**

#### Thuật toán bốc thăm tự động:
- ✅ Đặt hạt giống vào đúng vị trí (1 đầu bảng trên, 2 đầu bảng dưới)
- ✅ Tránh VĐV cùng CLB gặp nhau ở vòng 1
- ✅ Phân bổ BYE đều hai nửa bảng

#### Bốc thăm lại:
- Nếu muốn bốc thăm lại, nhấn **"🔄 Bốc thăm lại"**
- ⚠️ Lưu ý: Bốc thăm lại sẽ **xóa tất cả kết quả** hiện tại

### 4.5. Xem sơ đồ thi đấu (Bracket)

Sau khi bốc thăm, nhấn **"📊 Xem sơ đồ thi đấu"** để xem bracket:

- Sơ đồ hiển thị theo dạng cây nhánh
- **AKA** (đỏ) ở trên, **AO** (xanh) ở dưới
- VĐV BYE được đánh dấu tự động
- Nhấn vào trận đấu để mở scoreboard bấm điểm

### 4.6. Xuất PDF

1. Trên trang sơ đồ thi đấu, nhấn **"📄 Xuất PDF"** để xuất 1 hạng mục
2. Trên trang giải đấu, nhấn **"📄 Xuất tất cả PDF"** để xuất tất cả hạng mục đã bốc thăm
3. File PDF sẽ được lưu ở vị trí bạn chọn

### 4.7. Xuất file .krt cho HLV

File `.krt` là file để gửi cho HLV, cho phép HLV nhập danh sách VĐV trong thời hạn quy định.

1. Trên trang giải đấu, nhấn **"Xuất (.krt)"**
2. Thiết lập:
   - **Thời gian bắt đầu nhập**: Ngày giờ bắt đầu cho phép HLV nhập VĐV
   - **Thời gian kết thúc nhập**: Deadline - HLV phải nộp trước thời gian này
   - **Nội dung thi đấu**: Danh sách các nội dung (tự động lấy từ hạng mục)
3. Nhấn **"📤 Xuất file .krt"**
4. Gửi file `.krt` cho các HLV (qua USB, email, Zalo...)

### 4.8. Xuất file .kmatch cho Thư ký

File `.kmatch` là file để gửi cho Thư ký, cho phép Thư ký bấm điểm trận đấu.

1. Trên trang giải đấu, nhấn **"Xuất (.kmatch)"**
2. Thiết lập:
   - **Cho phép nhập điểm ngay**: Tick để Thư ký có thể bấm điểm
   - **Thời gian bắt đầu/kết thúc**: Khoảng thời gian cho phép nhập điểm
3. Nhấn **"🎯 Xuất file .kmatch"**
4. Gửi file cho Thư ký

### 4.9. Import danh sách VĐV từ HLV

Khi HLV gửi lại file (JSON hoặc Excel), Admin import vào hệ thống:

1. Nhấn **"Import từ HLV"** trên trang chủ Admin
2. Chọn file từ HLV
3. Xem trước dữ liệu: tên HLV, CLB, số VĐV
4. Nhấn **"Chấp nhận import"** để thêm VĐV vào giải đấu

---

## 5. HƯỚNG DẪN CHO HUẤN LUYỆN VIÊN (HLV)

HLV là vai trò dành cho các HLV các đội/CLB. HLV nhận file `.krt` từ Admin và nhập danh sách VĐV.

### 5.1. Mở file .krt

1. Chọn vai trò **"Huấn luyện viên"** ở trang chủ
2. Nhấn **"📁 Mở file .krt"**
3. Chọn file `.krt` do Admin gửi
4. Hệ thống hiển thị:
   - Tên giải đấu
   - Trạng thái thời gian (Chưa đến / Đang trong / Đã hết hạn)
   - Đếm ngược thời gian
   - Danh sách nội dung thi đấu

### 5.2. Nhập thông tin HLV

1. Điền **Tên HLV** và **Tên CLB** ở phần đầu trang
2. Thông tin này sẽ được lưu tự động

### 5.3. Thêm VĐV

> ⚠️ Chỉ có thể thêm/sửa/xóa VĐV **trong thời gian cho phép** (trạng thái "Đang trong thời gian nhập")

#### Thêm thủ công:
1. Nhấn **"+ Thêm VĐV"**
2. Điền thông tin:
   - **Họ tên** *(bắt buộc)*
   - **Giới tính** *(bắt buộc)*
   - **Ngày sinh**
   - **Cân nặng (kg)**
   - **Nội dung thi đấu** *(bắt buộc)* - chọn từ danh sách dropdown
   - **Thi đấu đồng đội** - tick nếu VĐV thi đấu đồng đội
3. Nhấn **"Thêm"**

#### Import từ Excel:
1. Nhấn **"📥 Tải mẫu Excel"** để tải file mẫu
2. Điền danh sách VĐV vào file mẫu
3. Nhấn **"📤 Import Excel"** và chọn file đã điền
4. Hệ thống sẽ tự động match tên nội dung thi đấu

### 5.4. Chỉnh sửa / Xóa VĐV

- Nhấn **✏️** để sửa thông tin VĐV
- Nhấn **🗑️** để xóa VĐV (cần xác nhận)

### 5.5. Xuất file gửi Admin

Sau khi nhập xong danh sách, xuất file để gửi cho Admin:

1. Cuộn xuống phần **"📤 Xuất file gửi Admin"**
2. Chọn định dạng:
   - **📄 Xuất JSON** - File nhẹ, chính xác
   - **📊 Xuất Excel** - Dễ xem trên máy tính
3. Gửi file cho Admin (qua USB, email, Zalo...)

---

## 6. HƯỚNG DẪN CHO THƯ KÝ

Thư ký là vai trò dành cho người bấm điểm tại các trận đấu.

### 6.1. Mở file .kmatch

1. Chọn vai trò **"Thư ký"** ở trang chủ
2. Nhấn **"📂 Mở file .kmatch"**
3. Chọn file `.kmatch` do Admin gửi
4. Hệ thống hiển thị danh sách các trận đấu

### 6.2. Bấm điểm trận đấu

1. Tìm trận đấu cần bấm điểm trong danh sách
2. Nhấn vào trận đấu để mở scoreboard
3. Bấm điểm theo luật thi đấu:
   - **Kumite**: Bấm điểm Yuko, Waza-ari, Ippon, phạt...
   - **Kata**: Nhập điểm từ các trọng tài
4. Kết quả được lưu tự động

### 6.3. Xuất kết quả

Sau khi bấm điểm xong, xuất kết quả để gửi cho Admin:
1. Nhấn nút xuất kết quả (JSON hoặc Excel)
2. Gửi file kết quả cho Admin

---

## 7. QUY TRÌNH TỔ CHỨC GIẢI ĐẤU HOÀN CHỈNH

Đây là quy trình từ A-Z để tổ chức một giải đấu Karate:

```
📝 BƯỚC 1: CHUẨN BỊ (Admin)
    │
    ├── Tạo giải đấu mới
    ├── Thêm các hạng mục thi đấu
    └── Xuất file .krt cho HLV
         │
         ▼
📋 BƯỚC 2: ĐĂNG KÝ VĐV (HLV)
    │
    ├── HLV nhận file .krt từ Admin
    ├── Mở file .krt trong phần mềm
    ├── Nhập danh sách VĐV (thủ công hoặc import Excel)
    └── Xuất file gửi lại Admin
         │
         ▼
📥 BƯỚC 3: TỔNG HỢP (Admin)
    │
    ├── Import file VĐV từ các HLV
    ├── Kiểm tra và chốt danh sách
    └── Bốc thăm tự động cho từng hạng mục
         │
         ▼
📊 BƯỚC 4: IN SƠ ĐỒ (Admin)
    │
    ├── Xem sơ đồ thi đấu trên màn hình
    ├── Xuất PDF cho từng hạng mục hoặc tất cả
    ├── In sơ đồ để treo tại nhà thi đấu
    └── Xuất file .kmatch cho Thư ký
         │
         ▼
🎯 BƯỚC 5: THI ĐẤU (Thư ký)
    │
    ├── Thư ký mở file .kmatch
    ├── Bấm điểm từng trận đấu
    └── Xuất kết quả cho Admin
         │
         ▼
🏆 BƯỚC 6: TỔNG KẾT (Admin)
    │
    ├── Import kết quả từ Thư ký
    ├── Cập nhật bracket (VĐV thắng tiến vào vòng sau)
    └── Xuất kết quả chung cuộc
```

### Chi tiết từng bước:

| Bước | Người thực hiện | Thời gian | Mô tả |
|------|----------------|-----------|-------|
| 1 | Admin | Trước giải 2-4 tuần | Tạo giải, thêm hạng mục, gửi .krt |
| 2 | HLV các đội | 1-2 tuần | Nhập VĐV, gửi file cho Admin |
| 3 | Admin | 1-3 ngày trước giải | Import VĐV, bốc thăm, in bracket |
| 4 | Admin | Ngày trước giải | In sơ đồ, chuẩn bị .kmatch |
| 5 | Thư ký | Ngày thi đấu | Bấm điểm từng trận |
| 6 | Admin | Sau giải | Tổng hợp kết quả |

---

## 8. CÂU HỎI THƯỜNG GẶP (FAQ)

### ❓ Phần mềm có cần internet không?
> **Không.** Phần mềm hoạt động 100% offline. Bạn chỉ cần cài đặt 1 lần.

### ❓ Dữ liệu được lưu ở đâu?
> Dữ liệu được lưu **tự động** trong bộ nhớ máy tính (localStorage). Bạn không cần nhấn "Lưu" thủ công.

### ❓ Một máy tính có thể dùng cho nhiều vai trò không?
> **Có.** Bạn có thể quay lại trang chọn vai trò bất kỳ lúc nào bằng nút **"← Quay lại"** hoặc **"Đổi vai trò"**.

### ❓ Có thể bốc thăm lại không?
> **Có.** Nhấn **"🔄 Bốc thăm lại"** nhưng lưu ý tất cả kết quả trận đấu cũ sẽ bị xóa.

### ❓ File .krt là gì?
> File `.krt` là file cấu hình giải đấu. Admin tạo file này và gửi cho HLV. HLV mở file để biết thông tin giải và nhập danh sách VĐV.

### ❓ File .kmatch là gì?
> File `.kmatch` là file chấm điểm. Admin tạo file này (sau khi bốc thăm) và gửi cho Thư ký. Thư ký mở file để bấm điểm trận đấu.

### ❓ HLV nhập VĐV ngoài thời hạn được không?
> **Không.** HLV chỉ có thể thêm/sửa/xóa VĐV trong khoảng thời gian Admin quy định. Ngoài thời hạn, hệ thống sẽ khóa chức năng chỉnh sửa.

### ❓ Làm cách nào để gửi file giữa Admin và HLV?
> Có nhiều cách:
> - 💾 Copy file qua **USB**
> - 📧 Gửi qua **Email**
> - 💬 Gửi qua **Zalo/Messenger**
> - ☁️ Upload lên **Google Drive** rồi chia sẻ link

### ❓ Hạt giống (seed) là gì?
> Hạt giống là VĐV được xếp hạng từ trước (top 1-8). Thuật toán bốc thăm sẽ đặt các hạt giống vào đúng vị trí để tránh họ gặp nhau ở các vòng đầu.

### ❓ BYE là gì?
> BYE là lượt trống. Khi số VĐV không phải lũy thừa của 2 (VD: 2, 4, 8, 16...), hệ thống sẽ tạo các vị trí BYE. VĐV được BYE sẽ tự động thắng vòng 1 mà không cần thi đấu.

### ❓ Đồng đội là gì?
> Tick "Thi đấu đồng đội" khi VĐV tham gia nội dung thi đấu theo đội (VD: Kata đồng đội, Kumite đồng đội). Mỗi "VĐV" trong trường hợp này thực chất là một đội.

---

## 9. XỬ LÝ SỰ CỐ

### 🔴 Không mở được file .krt / .kmatch
- Kiểm tra file có bị hỏng không (thử tải lại từ Admin)
- Đảm bảo file đúng định dạng (.krt hoặc .kmatch)

### 🔴 HLV không thêm được VĐV
- Kiểm tra thời gian: phải **trong khoảng thời gian cho phép**
- Xem thanh trạng thái trên cùng: phải hiển thị "Đang trong thời gian nhập"
- Nếu đã hết hạn, liên hệ Admin để điều chỉnh thời gian

### 🔴 Không bốc thăm được
- Cần ít nhất **2 VĐV** trong hạng mục
- Kiểm tra có VĐV trùng tên không

### 🔴 PDF xuất không đúng
- Đảm bảo đã bốc thăm trước khi xuất PDF
- Thử xuất lại bằng nút "📄 Xuất PDF"

### 🔴 Mất dữ liệu
- Dữ liệu được lưu trong localStorage của trình duyệt/ứng dụng
- **Không xóa dữ liệu trình duyệt** (cache/cookies) để tránh mất dữ liệu
- Nên **xuất file** (JSON/Excel) thường xuyên để backup

### 🔴 Phần mềm bị đơ/treo
- Đóng phần mềm và mở lại
- Nếu vẫn lỗi, liên hệ hỗ trợ kỹ thuật

---

## 📞 LIÊN HỆ HỖ TRỢ

- **Tác giả:** Trương Lưu Quân
- **Điện thoại:** 0336.440.523
- **Phiên bản:** Karate Tournament Manager v1.0.0

---

> 📌 **Mẹo:** Hãy đọc qua phần [Quy trình tổ chức giải đấu hoàn chỉnh](#7-quy-trình-tổ-chức-giải-đấu-hoàn-chỉnh) trước để hiểu tổng quan, sau đó đọc chi tiết phần vai trò bạn cần sử dụng.

---

*© 2026 Karate Tournament Manager. Bản quyền thuộc về tác giả.*
