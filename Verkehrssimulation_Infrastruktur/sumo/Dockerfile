FROM ghcr.io/eclipse-sumo/sumo:latest

# Fix: fehlende Runtime-Libs (libparquet.so.2300)
# (Je nach Base-Image heißen die Pakete leicht anders -> daher fallback)
RUN apt-get update && \
    (apt-get install -y --no-install-recommends libparquet2300 libarrow2300 || \
     apt-get install -y --no-install-recommends libparquet-dev libarrow-dev) && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /config
