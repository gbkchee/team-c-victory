#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
TASK_REPOSITORY='gbkchee/team-c-victory'

for TASK_COMMAND in git gh curl; do
  if ! command -v "$TASK_COMMAND" >/dev/null 2>&1; then
    printf '필요한 명령을 찾을 수 없습니다: %s\n' "$TASK_COMMAND" >&2
    exit 1
  fi
done

TASK_REMOTE=$(git remote get-url origin)
case "$TASK_REMOTE" in
  'https://github.com/gbkchee/team-c-victory.git'|'git@github.com:gbkchee/team-c-victory.git') ;;
  *) printf '대상 저장소가 일치하지 않습니다: %s\n' "$TASK_REMOTE" >&2; exit 1 ;;
esac

if [[ $(git branch --show-current) != 'main' ]]; then
  printf 'main 브랜치에서 실행해 주세요.\n' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  printf '아직 커밋되지 않은 변경이 있습니다. 변경을 확인하고 커밋한 뒤 실행해 주세요.\n' >&2
  exit 1
fi

printf 'GitHub 계정과 대상 저장소를 확인합니다.\n'
gh auth status --hostname github.com
gh api "repos/$TASK_REPOSITORY" --jq '.full_name'
gh auth setup-git --hostname github.com

printf '준비된 소스를 업로드합니다.\n'
git push -u origin main
TASK_HEAD_SHA=$(git rev-parse HEAD)

printf 'GitHub Pages의 배포 방식을 설정합니다.\n'
if gh api "repos/$TASK_REPOSITORY/pages" --silent 2>/dev/null; then
  gh api --method PUT "repos/$TASK_REPOSITORY/pages" -f build_type=workflow --silent
else
  gh api --method POST "repos/$TASK_REPOSITORY/pages" -f build_type=workflow --silent
fi

TASK_WORKFLOW_READY=false
for TASK_ATTEMPT in {1..12}; do
  if gh api "repos/$TASK_REPOSITORY/actions/workflows/deploy.yml" --silent 2>/dev/null; then
    TASK_WORKFLOW_READY=true
    break
  fi
  sleep 5
done
if [[ "$TASK_WORKFLOW_READY" != true ]]; then
  printf '배포 워크플로를 찾을 수 없습니다. 저장소의 Actions 상태를 확인해 주세요.\n' >&2
  exit 1
fi

printf '전략 검증과 웹페이지 배포를 실행합니다.\n'
TASK_DISPATCH_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
gh workflow run deploy.yml --repo "$TASK_REPOSITORY" --ref main

TASK_RUN_ID=''
for TASK_ATTEMPT in {1..12}; do
  TASK_RUN_ID=$(gh run list --repo "$TASK_REPOSITORY" --workflow deploy.yml \
    --branch main --commit "$TASK_HEAD_SHA" --event workflow_dispatch --limit 10 \
    --json databaseId,createdAt \
    --jq "[.[] | select(.createdAt >= \"$TASK_DISPATCH_TIME\")] | .[0].databaseId // empty")
  if [[ -n "$TASK_RUN_ID" ]]; then
    break
  fi
  sleep 5
done
if [[ -z "$TASK_RUN_ID" ]]; then
  printf '실행된 배포를 찾지 못했습니다. https://github.com/%s/actions 를 확인해 주세요.\n' "$TASK_REPOSITORY" >&2
  exit 1
fi

gh run watch "$TASK_RUN_ID" --repo "$TASK_REPOSITORY" --compact --exit-status
TASK_SITE_URL=$(gh api "repos/$TASK_REPOSITORY/pages" --jq '.html_url')
if [[ -z "$TASK_SITE_URL" || "$TASK_SITE_URL" == null ]]; then
  printf '배포 주소를 확인할 수 없습니다. GitHub Pages 설정을 확인해 주세요.\n' >&2
  exit 1
fi

printf '배포된 페이지에 접속되는지 확인합니다.\n'
TASK_SITE_READY=false
for TASK_ATTEMPT in {1..12}; do
  if curl --fail --silent --show-error --location --max-time 10 "$TASK_SITE_URL" >/dev/null; then
    TASK_SITE_READY=true
    break
  fi
  sleep 5
done
if [[ "$TASK_SITE_READY" != true ]]; then
  printf '배포는 완료됐지만 페이지 접속은 아직 확인하지 못했습니다: %s\n' "$TASK_SITE_URL" >&2
  exit 1
fi

printf '\n배포 및 접속 확인 완료: %s\n' "$TASK_SITE_URL"
