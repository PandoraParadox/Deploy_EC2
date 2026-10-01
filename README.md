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
sudo ln -s /etc/nginx/sites-available/launchpad /etc/nginx/sites-enabled/launchpad
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

> Bài lab dùng SQLite để đơn giản hóa bước đầu. Khi cần nhiều instance hoặc dữ liệu production, chuyển database sang Amazon RDS và giữ API contract hiện tại.
