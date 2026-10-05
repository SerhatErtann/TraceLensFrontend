# Dashboard'u derler ve nginx ile sunar. /api istekleri TraceLensService'e yönlendirilir.
#   docker build -t tracelens-dashboard .
#   docker run -p 8080:8080 -e TRACELENS_API_URL=http://<api-adresi>:8080 tracelens-dashboard

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Root olmayan kullanıcıyla 8080'de çalışan nginx
FROM nginxinc/nginx-unprivileged:1.27-alpine
# nginx imajı /etc/nginx/templates/*.template dosyalarındaki ${...} değişkenlerini açılışta doldurur
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV TRACELENS_API_URL=http://tracelens-service:8080
EXPOSE 8080
