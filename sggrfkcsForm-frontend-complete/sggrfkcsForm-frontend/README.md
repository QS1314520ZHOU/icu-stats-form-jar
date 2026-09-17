# sggrfkcsForm 前端代码

本包包含 `/form/sggrfkcsForm` 所需的完整 Angular 组件、XLS 对应横向打印样式、AI 编码提示词和接入说明。

## 接入

在 `app.routes.ts` 增加：

```ts
import { SggrfkcsFormComponent } from './sggrfkcs-form.component';
{ path: 'sggrfkcsForm', component: SggrfkcsFormComponent },
```

在 `app.module.ts` 增加 import，并将 `SggrfkcsFormComponent` 加入 `declarations`。

## 接口契约

- `GET /api/v1/icu/sggrfkcs/listByPid?pid={pid}`
- `POST /api/v1/icu/sggrfkcs/save`
- `PATCH /api/v1/icu/sggrfkcs/{id}/invalidate?operatorId={accountId}`
- `GET /api/v1/icu/accounts`

前三个接口需要后端配套实现。

## 构建

```bash
cd sjm1-app
npm install
npm run build
cd ..
rm -rf src/main/resources/static/form
mkdir -p src/main/resources/static/form
cp -a sjm1-app/dist/sjm1-app/browser/. src/main/resources/static/form/
mvn clean package -DskipTests
```

打印为 A4 横向，每页 12 条记录，地址为 `/form/sggrfkcsForm`。
