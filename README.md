# Launchpad / EC2 Lab

Một web app nhỏ để luyện deploy lên AWS EC2. App hiển thị dashboard deployment, có API Express và SQLite database lưu project, deployment, activity log.

## Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
npm run db:seed
npm start
```

Mở `http://localhost:3000`. Database được tạo tại `data/launchpad.db`.

## Cấu trúc database

- `projects`: thông tin service/project và môi trường chạy.
- `deployments`: lịch sử version được deploy, trạng thái và người thực hiện.
- `activity_logs`: timeline các hành động theo project.
- `deployments.project_id` và `activity_logs.project_id` là foreign key tới `projects.id`.
- Các index trong `schema.sql` phục vụ truy vấn theo project và thời gian.

## API chính

- `GET /health`: health check cho EC2 hoặc load balancer.
- `GET /api/dashboard`: thống kê, deployment gần đây và activity.
- `GET /api/projects`: danh sách project.
- `POST /api/deployments`: tạo deployment mới với JSON `{ "projectId": 1, "version": "v2.4.2", "deployedBy": "Linh Nguyen" }`.

## Cách 1: Docker all-in-one trên WSL2

Mục tiêu của bài lab này là gom frontend, Express API và SQLite vào một container.
Không cần Docker Desktop; Docker Engine chạy bên trong Ubuntu trên WSL2.

### 1. Cài WSL2 và Ubuntu

Mở PowerShell **Run as Administrator** trên Windows:

```powershell
wsl --install -d Ubuntu-24.04
```

Khởi động lại máy nếu Windows yêu cầu, mở ứng dụng Ubuntu và tạo Linux username/password.
Kiểm tra distro đang chạy bằng WSL2:

```powershell
wsl -l -v
```

Cột `VERSION` phải là `2`.

### 2. Kết nối tới EC2 từ WSL2

User data của bạn đã cài Docker Engine, Git, Nginx và UFW trên EC2.
Từ Ubuntu WSL2, kết nối bằng SSH:

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

Kiểm tra Docker trên EC2:

```bash
docker --version
docker compose version
sudo systemctl status docker --no-pager
```

Nếu user `ubuntu` chưa nhận group Docker sau lần chạy user data, thoát SSH và kết nối lại.
Trong lúc kiểm tra, có thể dùng `sudo docker ...`.

### 3. Lấy source và build image trên EC2

Đặt source trên GitHub/GitLab trước, sau đó chạy trên EC2:

```bash
cd ~
git clone <your-repository-url> deploy-web
cd ~/deploy-web
docker build -t launchpad:1.0 .
```

Lệnh này đọc `Dockerfile`, cài dependency, tạo database/schema và đóng gói app thành image `launchpad:1.0`.

### 4. Chạy container phía sau Nginx

User data đã bật Nginx trên port `80`, vì vậy chỉ expose container ở localhost:

```bash
docker run -d \
	--name launchpad \
	--restart unless-stopped \
	-p 127.0.0.1:3000:3000 \
	-v launchpad_data:/app/data \
	launchpad:1.0
```

Volume `launchpad_data` giữ file SQLite kể cả khi container bị restart.

Tạo Nginx reverse proxy:

```bash
sudo tee /etc/nginx/sites-available/launchpad > /dev/null <<'EOF'
server {
	listen 80 default_server;
	server_name _;

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	}
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sfn /etc/nginx/sites-available/launchpad /etc/nginx/sites-enabled/launchpad
sudo nginx -t
sudo systemctl reload nginx
```

Bây giờ mở `http://<EC2-PUBLIC-IP>` trên máy Windows.

### 5. Kiểm tra và xem log

```bash
docker ps
curl http://localhost/health
docker logs -f launchpad
```

Các lệnh quản lý thường dùng:

```bash
docker stop launchpad
docker start launchpad
docker restart launchpad
docker rm -f launchpad
```

### 6. Mở network trên AWS

Trong EC2 Security Group, mở inbound:

- TCP `22` từ IP của bạn để SSH.
- TCP `80` từ `0.0.0.0/0` để truy cập website.

UFW trong user data đã cho phép SSH và `Nginx Full`, nên không cần mở port `3000` ra Internet.

## Cách 2: EC2 chạy Node.js + PostgreSQL cài trực tiếp

Ở cách này không dùng Docker và không dùng Amazon RDS. PostgreSQL được cài trực tiếp trên cùng EC2, Node.js chạy bằng PM2, còn Nginx làm reverse proxy.
Khi có biến `DATABASE_URL`, app tự chọn PostgreSQL và tự tạo bảng từ `schema.postgres.sql`.

Bạn có thể dùng file [`user-data-postgres.sh`](user-data-postgres.sh) để cài sẵn công cụ. Dán file vào **Advanced details → User data** khi tạo EC2 Ubuntu 24.04. Script chỉ cài Node.js 20, PostgreSQL, PM2, Nginx, Git và UFW, đồng thời bật PostgreSQL/Nginx; không clone source, không tạo database, không cấu hình app và không mở firewall. Các bước còn lại thực hiện thủ công sau khi SSH vào EC2.

Trong EC2 Security Group chỉ mở:

```text
TCP 22 from your IP
TCP 80 from 0.0.0.0/0
```

Không mở TCP `3000` hoặc `5432` ra Internet.

### 1. Kiểm tra công cụ đã cài

SSH vào EC2 sau khi User Data hoàn tất:

```bash
node --version
npm --version
pm2 --version
git --version
sudo systemctl status postgresql --no-pager
sudo systemctl status nginx --no-pager
```

Nếu PostgreSQL chưa chạy, bật lại:

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql --no-pager
```

Tạo database và user riêng cho ứng dụng:

```bash
sudo -u postgres psql
```

Trong màn hình `psql`, chạy các lệnh sau và thay password mẫu bằng password mạnh:

```sql
CREATE USER app_user WITH PASSWORD 'change-this-password';
CREATE DATABASE launchpad OWNER app_user;
\\q
```

PostgreSQL chỉ cần lắng nghe trên localhost. Không mở port `5432` trong Security Group hoặc UFW ra Internet.

### 2. Lấy source và cài dependency

```bash
cd ~
git clone <your-repository-url> deploy-web
cd ~/deploy-web
npm ci --omit=dev
```

Tạo file môi trường để app kết nối PostgreSQL local:

```bash
cat > .env <<'EOF'
PORT=3000
DATABASE_URL=postgresql://app_user:<POSTGRES-PASSWORD>@127.0.0.1:5432/launchpad
DATABASE_SSL=false
EOF
chmod 600 .env
```

Khởi tạo schema và dữ liệu mẫu một lần:

```bash
npm run db:seed
```

### 3. Chạy app trực tiếp bằng PM2

```bash
pm2 start server.js --name launchpad
pm2 save
pm2 startup
```

Lệnh `pm2 startup` sẽ in ra một lệnh `sudo ...`; copy và chạy đúng lệnh đó để app tự chạy sau khi EC2 reboot.

### 4. Dùng Nginx làm reverse proxy

Nginx proxy từ port `80` tới Node.js trên port `3000`. Dùng file cấu hình ở Cách 1, sau đó:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl http://localhost/health
pm2 status
pm2 logs launchpad
```

Mở website tại `http://<EC2-PUBLIC-IP>`. Security Group của EC2 chỉ cần mở TCP `22` từ IP của bạn và TCP `80` từ Internet; không cần mở port `3000` hoặc `5432`.

> Cách 1 phù hợp để học Docker. Cách 2 chạy toàn bộ trực tiếp trên EC2 với PostgreSQL local, không phụ thuộc Docker hoặc RDS.
