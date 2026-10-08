# Ghi nhận nguồn và quyền sử dụng

Tài liệu phân tích repo [gr8rstudio/gr8r-studio](https://github.com/gr8rstudio/gr8r-studio) tại commit `904205c626918ee96054eb35495c394a60c0c601`.

Kiểm tra ngày 08/10/2026: tree không có file LICENSE/COPYING/NOTICE; README và package.json không nêu giấy phép; metadata repo qua GitHub trả `license: null`. `private: true` trong package.json là cấu hình npm package, không phải giấy phép và không nói repo GitHub là private.

GitHub giải thích sự khác nhau giữa quyền xem/fork một repo public và quyền dùng/sửa/phân phối theo license: [Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

Vì vậy bộ tài liệu không tự gán MIT, Apache hoặc một giấy phép khác cho code/design/logo/font của upstream, và không kết luận đã có quyền thương mại. Nếu Hòa đã có quyền do tác giả cấp, lưu bằng chứng đó cùng attribution thích hợp. Trước khi phân phối/publish/rebrand sản phẩm dựa trên source, xác nhận quyền và điều kiện cho code cùng tài nguyên đi kèm. Việc phân tích và tạo handoff kỹ thuật không bị dừng vì chưa có thông tin này.

Source gốc không được đóng gói lại trong ZIP handoff. Manifest chỉ ghi vị trí, commit và checksum để Codex lấy đúng phiên bản khi triển khai. Font/icon cũng cần giữ license của đúng tài nguyên dùng thực tế; không suy rộng license của một dependency sang toàn bộ ứng dụng.
