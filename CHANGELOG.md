# Changelog

## [1.1.0](https://github.com/shayane-zainab/Multi-Tenant_CRM/compare/v1.0.0...v1.1.0) (2026-08-13)


### Features

* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
* complete multi-tenant SaaS migration ([6e30205](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/6e30205f712f10255b6b0cfb954bc3603b4f70f6))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* multi-tenant provisioning, whatsapp integration, single vercel deploy ([7d64368](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/7d64368a7451cdb5cabad496e81ad33510ac80c2))
* multi-tenant provisioning, whatsapp integration, single vercel deploy ([defd495](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/defd4952faf00de1bf1b0c12911d3e712040030f))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))
* **whatsapp:** mirror WhatsApp conversations onto contacts ([b023bb7](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/b023bb7cf19e8876cedf7a325df4a081aef5ae7c))


### Fixes

* **api:** build the serverless function again ([2582f3c](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/2582f3c75416d7baeefdd31c71d72ac00724762e))
* **app:** generate route types before type checking ([03d4069](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **app:** keep API_URL in the build, drop a stray artefact ([e5a134f](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/e5a134f57bbe383c3369387208a33a1911f9bda8))
* **auth:** provision an organization on first sign-in ([8cd3942](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/8cd39428480a9397a0fca7310805ebc4f2f1fdd9))
* **db:** add the missing multi-tenant migration and scope the client ([2507170](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/25071707f8778703854e4b79784735764160463d))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/8871e49d153db694933537a6ac28219d7761478b))
* resolve agent typescript errors from multi-tenant migration ([8f59302](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/8f59302fc724ec81f1ded953d78cb1c118c71093))
* resolve remaining typescript multi-tenant compilation errors ([ff4df3c](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/ff4df3cf57d61049bb4db92ad10760231c4c1ef9))
* **vercel:** resolve serverless function build and TS module resolution ([7dbd0dd](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/7dbd0ddd3eb1f3fec91064dfe17b42374cd74861))


### Refactors

* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/shayane-zainab/Multi-Tenant_CRM/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## 1.0.0 (2026-08-03)


### Features

* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/trycompai/crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
