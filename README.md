# URL Shortener

A simple URL shortener with analytics built with Fastify and MongoDB.

## Features

- Shorten URLs with custom codes
- Click analytics (visitors, devices, browsers, countries)
- User dashboard with real-time updates
- Admin panel for user/link management
- Domain blacklist with regex support
- Daily link creation limits
- JWT authentication with refresh tokens

## Tech Stack

- **Backend**: Fastify, MongoDB (Mongoose)
- **Frontend**: EJS, Tailwind CSS, Socket.io
- **Auth**: JWT (access + refresh tokens)

## Quick Start

```bash
# Install dependencies
npm install

# Copy .env.example to .env and configure
cp .env.example .env

# Run development server
npm run dev

# Run production
npm start
```

## Environment Variables

```bash
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/url-shortener
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
COOKIE_SECRET=your_cookie_secret
GUEST_DAILY_LIMIT=10
USER_DAILY_LIMIT=15
ADMIN_DAILY_LIMIT=30
```

## License

```bash
MIT
```