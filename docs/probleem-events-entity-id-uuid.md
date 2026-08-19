# Probleem: events.entity_id (uuid) weigert Better Auth-user-ids

## Wat er misgaat

In productie faalt de wachtwoord-reset-flow op het events-insert:

```
Neon: invalid input syntax for type uuid: "EEblFloyGFm4GuZgvym3h23kJVGLJarl"
```

De aanroep zit in `sendResetPassword` in `lib/auth-factory.ts:110` — `logEvent(database,
{ entity: "user", entityId: user.id, ... })`. `onPasswordReset` (`lib/auth-factory.ts:121`,
`password_reset_completed`) heeft exact hetzelfde patroon en faalt dus ook.

`events.entity_id` is een `uuid`-kolom (`db/schema.ts:791`). Better Auth genereert user-ids
met zijn eigen default-generator: 32 alfanumerieke tekens, géén uuid. Elke user die via de
magic-link-flow is ontstaan heeft zo'n id — de insert kan voor die users nooit slagen.

Gevolg: de reset-callback gooit, dus de flow breekt in productie ná het loggen van de
resetlink maar vóór een succesvolle afronding van de request (afhankelijk van hoe Better Auth
de exception afhandelt); minimaal ontbreekt het event (ijzeren regel 5), waarschijnlijk
faalt de hele request.

## Waarom de PGlite-test dit niet ving

`lib/auth-password-reset.test.ts` was groen om een **fixture-reden, geen schemaverschil**:
PGlite en Neon hebben hetzelfde schema en PGlite handhaaft uuid-syntax net zo hard. Maar de
test maakt users uitsluitend aan via twee paden die tóevallig altijd een uuid opleveren:

1. De PIN-activatieflow: `lib/repo/activation.ts:213` insert de user zelf met
   `crypto.randomUUID()`.
2. Het magic-link-randgeval in de test: handmatige insert met `crypto.randomUUID()`
   (`lib/auth-password-reset.test.ts:242`).

Geen enkel testpad laat **Better Auth zelf** een user aanmaken, dus de default-id-generator
(de productie-realiteit voor magic-link-users) komt in de tests nooit voor. Het gat is dus:
de fixtures dekken één van de twee id-vormen die in productie bestaan.

## Reikwijdte

- Alle `entityId: user.id`-aanroepen: alleen de twee in `lib/auth-factory.ts` (geverifieerd
  met grep over `lib/` en `app/`). Overige `logEvent`-callers geven uuid's uit eigen
  tabellen door (orgs, brands, uploads, …) — die zijn veilig.
- Productiedata: er bestaan al users met niet-uuid-ids; een fix die alleen *nieuwe* users
  een uuid geeft (Better Auth `advanced.database.generateId`) lost het voor bestaande users
  niet op.
- `custom_fields` koos bewust een uuid-PK "omdat events.entity_id uuid is"
  (`db/schema.ts:1065`) — een kolomtype-wijziging raakt dat ontwerpbesluit.

## Meetlat voor de fix

1. Wachtwoord-reset (request én completion) slaagt voor een user met een Better
   Auth-gegenereerd id, bewezen in een PGlite-test die Better Auth zélf de user laat
   aanmaken (niet via `crypto.randomUUID()`).
2. Beide events belanden in de events-tabel met een bruikbare verwijzing naar de user.
3. Geen regressie op de bestaande resettests en de rest van de suite.
