# 핏플랜 배포용 폴더

이 폴더(`fitplan-site`) 안의 내용이 그대로 웹사이트입니다. 빌드 과정이 없는 정적 사이트입니다.

## 가장 쉬운 방법: Netlify Drop (설치·Git 불필요)
1. https://app.netlify.com/drop 에 접속합니다.
2. 이 `fitplan-site` 폴더를 통째로 화면에 끌어다 놓습니다.
3. 몇 초 뒤 `https://무작위이름.netlify.app` 주소가 생성됩니다. 이 주소를 공유하면 누구나 접속합니다.
4. 가입(무료)하면 주소가 유지되고, 사이트 이름과 도메인을 바꿀 수 있습니다. 가입하지 않으면 임시 주소라 일정 시간 뒤 만료될 수 있습니다.

## 다른 방법
- **Cloudflare Pages**: Workers & Pages → Create → Pages → Upload assets 에서 폴더 업로드.
- **GitHub Pages**: 저장소를 만들고 이 폴더 내용을 올린 뒤 Settings → Pages → main / root. (웹 업로드는 한 번에 100개 제한이라 `assets/ex` 폴더를 나눠 올려야 합니다.)
- **Vercel**: GitHub 저장소를 연결하면 푸시할 때마다 자동 배포됩니다. Framework는 Other, Build Command와 Output Directory는 비워 둡니다.

## 출처 표기 (중요)
근육 해부도와 운동 사진은 wger.de의 오픈 데이터(CC-BY-SA)입니다. 사이트에 이미 작성자와 출처가 표기되어 있으니 `js/eximages.js`와 페이지 하단 문구를 지우지 마세요.
