FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Store as a template; envsubst fills in BACKEND_HOST and PORT at container start.
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 3000
# nginx:alpine processes /etc/nginx/templates/*.template automatically via envsubst.
CMD ["nginx", "-g", "daemon off;"]
