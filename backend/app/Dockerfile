FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /workspace

COPY pom.xml ./
COPY modules ./modules
COPY app ./app
COPY test-support ./test-support

RUN mvn -B -DskipTests -pl app -am package \
    && find app/target -maxdepth 1 -type f -name "*.jar" ! -name "original-*" -print -quit \
      | xargs -I{} cp "{}" /workspace/app.jar

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install --no-install-recommends -y curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system childedu \
    && useradd --system --gid childedu --create-home --home-dir /app childedu

WORKDIR /app
COPY --from=build --chown=childedu:childedu /workspace/app.jar /app/app.jar

USER childedu

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD curl --fail --silent http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
