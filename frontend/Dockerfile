FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps --loglevel=error

COPY . .

# CI=false: prevents warnings from failing the build
# GENERATE_SOURCEMAP=false: significantly speeds up the build
ENV CI=false
ENV GENERATE_SOURCEMAP=false

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
