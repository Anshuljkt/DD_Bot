# FROM mcr.microsoft.com/dotnet/aspnet:6.0

# COPY src/DD_Bot.Bot/bin/Release/net6.0/ /app/
# # allow all users access to this so we can run container as non root.
# RUN chmod -R 775 /app
# USER root

# WORKDIR /app/

# ENTRYPOINT ["dotnet", "DD_Bot.Bot.dll"]


FROM mcr.microsoft.com/dotnet/aspnet:6.0 AS base
WORKDIR /app
RUN chmod -R 775 /app 
USER root

# EXPOSE 5000

# ENV ASPNETCORE_URLS=http://+:5000

# Creates a non-root user with an explicit UID and adds permission to access the /app folder
# For more info, please refer to https://aka.ms/vscode-docker-dotnet-configure-containers
# RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
# USER appuser

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:6.0 AS build
ARG configuration=Release
WORKDIR /src
COPY ["src/DD_Bot.Bot/DD_Bot.Bot.csproj", "src/DD_Bot.Bot/"]
RUN dotnet restore "src/DD_Bot.Bot/DD_Bot.Bot.csproj"
COPY . .
WORKDIR "/src/src/DD_Bot.Bot"
RUN dotnet build "DD_Bot.Bot.csproj" -c $configuration -o /app/build

FROM build AS publish
ARG configuration=Release
RUN dotnet publish "DD_Bot.Bot.csproj" -c $configuration -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "DD_Bot.Bot.dll"]

# To publish:
# docker buildx build \
# --push \
# --platform linux/amd64,linux/arm64 \
# --tag anshuljkt1/dd-bot-advanced:latest \
# .