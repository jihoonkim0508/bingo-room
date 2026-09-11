# Bingo Room

로그인 없이 방을 만들고 함께 플레이하는 온라인 빙고 게임입니다.

라이브 데모: https://bingo-web-2df1d.web.app

## 실행

```bash
npm install
npm run dev
```

Firebase 환경변수가 없으면 데모 모드로 실행됩니다. 실제로 여러 브라우저에서 같은 방을 사용하려면 `.env.example`을 `.env`로 복사하고 Firebase Web App 설정값을 입력하세요.

```bash
Copy-Item .env.example .env
```

Firebase Console에서 다음을 켜야 합니다.

1. Authentication → Sign-in method → Anonymous
2. Realtime Database 생성
3. Realtime Database Rules에 `database.rules.json` 내용 적용

## 빌드

```bash
npm run build
```

정적 결과물은 `dist`에 생성됩니다. GitHub Pages로 배포할 때는 `dist`를 배포 대상으로 사용하면 됩니다. `vite.config.ts`의 상대 경로 설정 때문에 프로젝트 페이지 하위 경로에서도 동작합니다.

Firebase Hosting을 사용할 경우에는 다음 명령으로 배포할 수 있습니다.

```bash
npx firebase-tools login
npx firebase-tools init
npx firebase-tools deploy
```

## 구현 범위

- 방 만들기 / 방 들어가기
- 닉네임 기반 익명 참가
- 방장 게임 설정
- 2×2~5×5 빙고판
- 준비 완료 및 자동 시작
- 엄격 자동 체크 / 느슨 직접 체크
- 턴 기반 단어 호출
- 호출 기록과 채팅
- 1명 완성 / 1명 빼고 승리 조건
- 빙고 수와 결과 표시
- 재시작 및 방 설정 복귀

현재 Firebase 저장은 작은 지인용 방을 위한 전체 방 상태 동기화 방식입니다. 대규모 방, 강한 치트 방지, 서버에서의 비밀번호 검증이 필요해질 때만 필드 단위 Security Rules와 신뢰 서버를 추가하면 됩니다.
