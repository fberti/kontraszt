FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ENV CI=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["sleep", "infinity"]
