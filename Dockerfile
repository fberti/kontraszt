FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ENV CI=1
ENV PNPM_HOME=/pnpm
ENV VP_HOME=/root/.vite-plus
ENV PATH=$VP_HOME/bin:$PNPM_HOME:$PATH

RUN corepack enable \
 && curl -fsSL https://vite.plus | VP_NODE_MANAGER=no bash

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["sleep", "infinity"]
