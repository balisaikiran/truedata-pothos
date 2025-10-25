# TrueData API Integration Report (Issues, Evidence, and Clarifications)

This document summarizes the real-world behavior we observed while integrating and testing TrueData APIs for our dashboard. It includes cURL reproductions, actual responses, and clear questions/requests for the TrueData team.

## Environment
- Account type: Trial
- Authentication flow: OAuth password grant to obtain Bearer access token
- Base endpoints used:
  - Auth: https://auth.truedata.in/token
  - History: https://history.truedata.in
  - REST: https://api.truedata.in
  - Greeks: https://greeks.truedata.in/api
- We avoided committing credentials; cURL examples below use placeholders.

## Summary of Findings

1) Authentication (OAuth password grant)
- Status: Works consistently in current tests; token issued with ~15–16h expiry.
- Prior behavior observed: occasional `invalid_grant` responses (intermittent). If this persists, please confirm any rate/lockout conditions or subscription constraints that can trigger `invalid_grant`.

2) LTP endpoints
- `getLTPBulk` (History) returns JSON reliably and is suitable for dashboard LTP.
- `getLTP` (single) sometimes returns a non-JSON payload; JSON parsing fails ("Expecting value"). Recommendation: standardize JSON response for `getLTP` or advise clients to exclusively use `getLTPBulk`.

3) Historical Bars
- EOD bars return data reliably.
- Intraday minute intervals:
  - Using `interval=1m` returns `status: "Invalid interval"`.
  - Using `interval=1min` sometimes returns `status: "No data exists for <symbol>"` for recent short windows (e.g., last 30–60 minutes). Clarify accepted interval strings and any trial/subscription restrictions for recent intraday history.
- Date/time parameter format: YYMMDDTHH:MM:SS worked for History endpoints.

4) Historical Ticks
- We received `status: "No data exists for <symbol>"` for a recent 10-minute window (with `bidask=1`). Clarify tick history availability for trial accounts and the correct time windows or symbol-specific limitations.

5) Options Chain and Greeks
- Greeks API (Bearer): `getOptionChainwithGreeks` at `greeks.truedata.in/api` returned HTTP message indicating no matching resource when called without required parameters (e.g., missing expiry/strike/series). Please provide the exact required parameter set and accepted formats.
- REST API (user/password): `getoptionchain` returned an exception when `expiry` was omitted or incorrectly formatted. Please confirm:
  - Exact expiry formats required (e.g., `YYYYMMDD` vs `DD-MM-YYYY`)
  - Whether this endpoint should use user/password query params (as Symbol Master) or Bearer.

6) Symbol Master
- `getAllSymbols` works with query params `user`, `password`, and returns consistent data (JSON). This differs from History/Greeks which rely on Bearer.

7) Authentication schemes across API families
- Observed inconsistency:
  - History and Greeks often use Bearer tokens in headers.
  - REST endpoints like `getAllSymbols` and `getoptionchain` require `user` and `password` in the query string.
- Request: Please confirm the officially supported authentication schemes per API family and recommend a consistent approach for production applications.

## Reproduction (cURL)

Replace placeholders: `<USERNAME>`, `<PASSWORD>`, `<ACCESS_TOKEN>`.

1) Obtain access token (OAuth)
```
curl -X POST 'https://auth.truedata.in/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'username=<USERNAME>' \
  --data-urlencode 'password=<PASSWORD>' \
  --data-urlencode 'grant_type=password'
```

2) LTP Bulk (JSON)
```
curl 'https://history.truedata.in/getLTPBulk?symbols=RELIANCE&response=json' \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
Expected: `{"status":"Success","Records":[[<id>,"<timestamp>",<price>,<volume>,<change>]]}`

3) EOD Bars (JSON)
```
curl "https://history.truedata.in/getbars?symbol=NIFTY%2050&from=210129T09:00:00&to=$(date -u +%y%m%dT%H:%M:%S)&response=json&interval=eod" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
Expected: `{"status":"Success","Records":[["YYYY-MM-DD",<open>,<high>,<low>,<close>,<volume>,<delivery?>],...]}`

4) Intraday Bars (JSON) – interval clarification needed
```
# Example 60-minute window, 1-minute interval
curl "https://history.truedata.in/getbars?symbol=RELIANCE&from=YYMMDDTHH:MM:SS&to=YYMMDDTHH:MM:SS&response=json&interval=1min" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
Possible responses: `"Invalid interval"` (for `1m`) or `"No data exists for RELIANCE"` for recent windows.

5) Ticks (JSON)
```
curl "https://history.truedata.in/getticks?symbol=RELIANCE&from=YYMMDDTHH:MM:SS&to=YYMMDDTHH:MM:SS&bidask=1&response=json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
Observed: `status: "No data exists for RELIANCE"` for short recent windows.

6) Symbol Master (JSON)
```
curl "https://api.truedata.in/getAllSymbols?segment=eq&user=<USERNAME>&password=<PASSWORD>&token=true&companyname=true&isin=true&ticksize=true&limit=5&search=RELIANCE"
```
Expected: `{"status":"Success","Records":[...]}"

7) Options Chain
- REST API (requires user/password; expiry likely required)
```
curl "https://api.truedata.in/getoptionchain?symbol=RELIANCE&expiry=<YYYYMMDD>&response=json&user=<USERNAME>&password=<PASSWORD>"
```
- Greeks API (Bearer; must include required params)
```
curl "https://greeks.truedata.in/api/getOptionChainwithGreeks?symbol=RELIANCE&expiry=<DD-MM-YYYY>&strike=<VALUE>&series=<CE|PE>&response=json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
Note: Please confirm which formats are valid for `expiry` and which parameters are mandatory for each API.

## Requests and Clarifications for TrueData

1) Provide the canonical interval names supported by History `getbars` (e.g., `1min`, `5min`, `15min`, `30min`, `60min`, `eod`) and explicitly deprecate unsupported ones like `1m` if applicable.
2) Confirm the allowed date/time format for the History API (we used `YYMMDDTHH:MM:SS`).
3) Clarify subscription/trial constraints for recent intraday bars and tick history (we saw "No data exists" on short windows for RELIANCE).
4) Standardize JSON response for single `getLTP` or confirm that `getLTPBulk` should be the only JSON entry point for LTP.
5) Document and unify authentication schemes across API families:
   - History and Greeks: Bearer header
   - REST (Symbol Master, Option Chain): user/password in query
   - Recommend a single approach or publish a compatibility matrix.
6) For Options APIs:
   - Confirm mandatory parameters and accepted formats for `expiry`, `strike`, `series`
   - Clarify which base URL and auth scheme should be used for `getoptionchain` vs `getOptionChainwithGreeks`
   - Provide a minimal working example for a mainstream symbol (e.g., NIFTY) including valid expiry.
7) Share error codes/messages documentation for common conditions (quota exceeded, rate-limiting, invalid_grant, no data).

## What we will adjust on our side (pending your guidance)
- Use `getLTPBulk` for all LTP needs.
- Switch intraday bars default interval to `1min` (not `1m`).
- Align Options calls to the correct base/auth and require explicit `expiry` in the expected format.
- Maintain Symbol Master calls with `user`/`password` params.

If you need specific logs or timestamps, we can provide exact request/response bodies collected during testing upon request.