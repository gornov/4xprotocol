FROM rust:1.76

WORKDIR /usr/src/perpetuals

RUN sh -c "$(curl -sSfL https://release.solana.com/v1.14.13/install)"
ENV PATH="${PATH}:/root/.local/share/solana/install/active_release/bin"
RUN solana config set --url localhost && solana-keygen new --silent --no-bip39-passphrase

RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install latest
RUN avm use latest

RUN apt-get update -y && apt-get upgrade -y && apt-get install -y pkg-config build-essential libudev-dev libssl-dev openssl
RUN apt-get install -y netcat-traditional libssl-dev libudev-dev pkg-config zlib1g-dev llvm clang cmake make libprotobuf-dev protobuf-compiler

RUN wget http://nz2.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.22_amd64.deb
RUN dpkg -i libssl1.1_1.1.1f-1ubuntu2.22_amd64.deb

ENV NVM_DIR="/root/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && . "$NVM_DIR/bash_completion" \
    && nvm install v20.12.0 \
    && nvm use v20.12.0 \
    && npm install --global yarn

ENV NODE_PATH $NVM_DIR/v20.12.0/lib/node_modules
ENV PATH      $NVM_DIR/v20.12.0/bin:$PATH

RUN rustup default 1.66.0
RUN cargo-build-sbf --arch bpf || echo "OMIT BPF ERROR"

COPY . .

RUN anchor build
RUN . "$NVM_DIR/nvm.sh" \
    && cd app && yarn install && cd - \
    && cd ui && yarn install && yarn next telemetry disable && cd -

ENTRYPOINT ["/bin/bash"]
