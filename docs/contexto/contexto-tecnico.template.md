# Contexto Técnico — [Nombre del Proyecto]

> **Instrucciones:** copia este archivo como `contexto-tecnico.md`, rellena cada sección
> y borra estas instrucciones.

---

## 1. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | [ej: Java Spring Boot] | [ej: 3.2] |
| Frontend | [ej: Angular] | [ej: 17] |
| Base de datos | [ej: PostgreSQL] | [ej: 15] |
| Mensajería | [ej: Apache Kafka] | [ej: 3.6] |
| Contenedores | [ej: Docker / Kubernetes] | — |
| CI/CD | [ej: GitHub Actions] | — |

---

## 2. Arquitectura

**Patrón:** [ej: Microservicios / Monolito / Serverless]

### Microservicios / Módulos Principales

| Servicio | Responsabilidad |
|---------|----------------|
| [ej: sbs-api-emisión] | [ej: orquesta el flujo de creación de pólizas] |
| [ej: sbs-api-recaudo] | [ej: gestiona cobros automáticos vía PSE/débito] |
| [ej: tp-sponsor] | [ej: catálogo maestro de sponsors y carátulas] |

---

## 3. Integraciones Externas

| Sistema | Tipo | Descripción |
|---------|------|-------------|
| [ej: DIAN e-factura] | REST API | [ej: emisión de facturas electrónicas] |
| [ej: Pasarela de pagos] | REST API | [ej: procesamiento de recaudos automáticos] |
| [ej: Notificaciones SMS/Email] | Evento Kafka | [ej: alertas a asegurados] |

---

## 4. Entornos

| Entorno | URL / Descripción |
|---------|------------------|
| Desarrollo | [ej: local con Docker Compose] |
| QA | [ej: sbs-qa.miempresa.com] |
| Staging | [ej: sbs-staging.miempresa.com] |
| Producción | [ej: sbs.miempresa.com] |

---

## 5. Equipo del Sprint

| Nombre | Rol |
|--------|-----|
| [ej: Ana García] | DEV |
| [ej: Luis Torres] | DEV |
| [ej: María Pinto] | QA |
| [ej: Juan Díaz] | FE |

**Horas efectivas por persona/día:** [ej: 6h (descontando ceremonias)]

---

## 6. Restricciones Técnicas — **Contrato ejecutable**

> Las sub-secciones 6.1 a 6.4 son **el contrato que el `spec-writer` y el `hu-full-analyzer` aplican** al generar specs, CAs y tareas para este sprint. Todo lo no declarado aquí se considera fuera del alcance técnico del sprint. No heredamos reglas globales — cada proyecto define su propio stack y restricciones.

### 6.1 Tecnologías permitidas

Además del stack declarado en la sección 1 y las integraciones de la sección 3, se permiten:

| Categoría | Permitido | Versión mínima / Notas |
|---|---|---|
| [ej: Librerías de utilidades] | [ej: lodash, date-fns, zod] | [ej: sin polyfills manuales, usar las APIs nativas cuando existan] |
| [ej: Cliente HTTP] | [ej: axios 1.x] | [ej: usar interceptors compartidos del BFF] |
| [ej: ORM / query builder] | [ej: TypeORM] | [ej: evitar raw SQL fuera de migraciones] |

### 6.2 Tecnologías / librerías PROHIBIDAS

Lista explícita de lo que el spec-writer debe **rechazar** si aparece en una propuesta de solución. Si una alternativa listada aquí aparece en una HU, el Gate 0 del spec falla y se sustituye por un equivalente permitido.

| Prohibido | Motivo | Alternativa permitida |
|---|---|---|
| [ej: AWS Lambda, S3] | [ej: política corporativa — cloud provider único] | [ej: Firebase Functions, Cloud Storage] |
| [ej: moment.js] | [ej: librería deprecada + peso bundle] | [ej: date-fns] |
| [ej: jQuery] | [ej: incompatible con el stack Angular 17] | [ej: RxJS + signals nativos] |

### 6.3 Convenciones de código obligatorias

Normas que **el spec-writer** debe reflejar en la sección "Arquitectura" y que **el hu-full-analyzer** debe considerar al estimar tareas de verificación.

- [ej: TypeScript estricto (`strict: true`, sin `any` implícitos)]
- [ej: ES Modules (`import`/`export`), nunca CommonJS `require`]
- [ej: Nombres de archivos en `kebab-case`, componentes en `PascalCase`, variables en `camelCase`]
- [ej: Semantic HTML5 obligatorio (`<header>`, `<main>`, `<article>` etc.) — no `<div>`-soup]
- [ej: Cobertura mínima de tests 80% líneas / 70% ramas por PR]

### 6.4 Herramientas obligatorias

Herramientas que deben aparecer como tareas de verificación o configuración en las estimaciones PERT si la HU toca su área.

| Área | Herramienta obligatoria | Uso |
|---|---|---|
| [ej: CI/CD] | [ej: GitHub Actions] | [ej: pipeline `.github/workflows/pr.yml` ejecuta lint + test + build + sonar] |
| [ej: Testing unitario] | [ej: Jest 29 + Testing Library] | [ej: 1 archivo `*.spec.ts` por servicio; mocks con `jest.mock`] |
| [ej: Linter] | [ej: ESLint + Prettier] | [ej: config compartida en `@empresa/eslint-config`] |
| [ej: Gestión de secretos] | [ej: Google Secret Manager] | [ej: nunca hardcodear credenciales; leer desde `process.env` poblado por el runtime] |
| [ej: Observabilidad] | [ej: OpenTelemetry + Google Cloud Logging] | [ej: todo endpoint emite traza con `x-request-id`] |

---

## 7. Otras restricciones de arquitectura

(Esta sección es libre — usar para invariantes arquitectónicas que no encajan en 6.1–6.4.)

- [ej: Los microservicios se comunican únicamente vía Kafka (no llamadas síncronas directas)]
- [ej: Base de datos compartida entre sbs-api-emisión y sbs-api-recaudo (migrar con Flyway)]
- [ej: El frontend consume exclusivamente el BFF, nunca los microservicios directamente]
