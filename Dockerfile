FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Cài đặt dependencies
RUN npm install --omit=dev

# Copy toàn bộ mã nguồn
COPY . .

# Mở cổng 3000
EXPOSE 3000

# Khởi chạy server
CMD ["node", "src/server.js"]
