# VIGIA provider setup

VIGIA fails each provider independently. A missing credential never turns absent coverage into “no fire,” and it never prevents other sources from running.

Start with the operator-facing diagnosis:

```zsh
cd /Users/malmeida/Documents/Development/vigia
npm run source:doctor -- all
```

The doctor reports configuration, credential presence without revealing secrets, provider reachability, last acquisition, checkpoint, raw archive, latest observation, parser state, source incident, and the exact activation path. Use `--json` for machine-readable output and `--strict` when an unconfigured selected source should fail CI.

## NASA FIRMS / VIIRS

NASA issues a free 32-character FIRMS MAP_KEY at [NASA FIRMS API key registration](https://firms.modaps.eosdis.nasa.gov/api/map_key). The official API supports area CSV requests for `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, and `VIIRS_SNPP_NRT`.

In the same terminal that will run VIGIA:

```zsh
cd /Users/malmeida/Documents/Development/vigia
read -r -s 'NASA_FIRMS_MAP_KEY?Paste the NASA FIRMS key, then press Enter: '
printf '\n'
export NASA_FIRMS_MAP_KEY
printf 'Key loaded: %s characters\n' "${#NASA_FIRMS_MAP_KEY}"
npm run source:doctor -- firms
```

Then start VIGIA from that same shell. Never paste status sentences into the terminal; only paste commands. Never commit the key or put it in a client-side `.env` file.

With a valid key, VIGIA polls three independent VIIRS platform feeds, archives the raw CSV before parsing, records SHA-256 and source timestamps, normalizes physical observations, associates them into physical events, commits raw products/observations/events/checkpoints in one PostGIS transaction, and deduplicates by content and provider product identity.

## Sentinel-3 SLSTR FRP

The official product is Sentinel-3 SLSTR Level-2 Fire Radiative Power, `SL_2_FRP`, available in NRT and NTC. The public [Copernicus Data Space STAC catalogue](https://documentation.dataspace.copernicus.eu/APIs/STAC.html) exposes the `sentinel-3-sl-2-frp-nrt` collection. Product download requires a free Copernicus Data Space account and access token.

For unattended local/shadow acquisition, set the account in the server shell:

```zsh
export VIGIA_CDSE_USERNAME='your-copernicus-login'
read -r -s 'VIGIA_CDSE_PASSWORD?Paste the Copernicus password, then press Enter: '
printf '\n'
export VIGIA_CDSE_PASSWORD
npm run source:doctor -- sentinel3
```

For an existing managed downloader or air-gapped product path, use either:

```zsh
export VIGIA_SENTINEL3_FRP_DIR='/absolute/path/to/sl_2_frp_products'
```

or a trusted internal gateway returning the documented normalized detection JSON:

```zsh
export VIGIA_SENTINEL3_FRP_JSON_URL='https://your-gateway.example/sentinel3/frp'
```

## MTG FCI FRP point product

Structured MTG point evidence is LSA SAF `MTFRPPIXEL` / LSA-509, not the raster context layer. EUMETSAT lists the product as demonstration-status NRT, 1 km nominal resolution, every 10 minutes, distributed on EUMETCast; the LSA SAF data server also requires registration. The raster context can remain available when the point product is credential-blocked, but VIGIA displays those states separately.

Configure a registered product drop:

```zsh
export VIGIA_MTG_FRP_DIR='/absolute/path/to/eumetcast/MTFRPPIXEL'
npm run source:doctor -- mtg
```

or a trusted internal structured gateway:

```zsh
export VIGIA_MTG_FRP_JSON_URL='https://your-gateway.example/mtg/frp'
```

Expected native file pattern:

```text
W_PT-LSASAF-LISBON,SATELLITE,LSA-509_MTG_MTFRPPIXEL_MTG-FD_C_LPMG_YYYYMMDDHHMM.nc
```

## Sentinel-2, reports, and weather

Sentinel-2 L2A screening uses the public Earth Search STAC catalogue and native COG windows. It is on-demand and does not claim a national polling cursor. ICNF SGIF reports and IPMA weather context are public-source paths normalized through the existing ptdata gateway. Diagnose each independently:

```zsh
npm run source:doctor -- sentinel2
npm run source:doctor -- reports
npm run source:doctor -- weather
```

## Full local start

```zsh
cd /Users/malmeida/Documents/Development/vigia
REQUEST_TIMEOUT_MS='5000' \
NASA_FIRMS_MAP_KEY='YOUR_REAL_KEY' \
npm run shadow:local
```

`shadow:local` generates protected local database and Operator credentials, starts the existing PostGIS volume preservation-safely, and launches the API. Add configured provider variables before the command. Environment variables exist only in the shell/process tree where they were exported.

## Persistent local credentials on macOS

VIGIA also loads the allowlisted provider variables from `~/.config/vigia/secrets.env` before consulting the macOS Keychain. The file must be owned by the current user and have mode `0600`; otherwise it is rejected. Explicit process environment variables always win. Shell expansion and arbitrary variable names are not evaluated.

```zsh
mkdir -p ~/.config/vigia
chmod 700 ~/.config/vigia
touch ~/.config/vigia/secrets.env
chmod 600 ~/.config/vigia/secrets.env
```

For this local workstation only, VIGIA also reads provider credentials from the login Keychain when the corresponding environment variable is absent. Environment variables always take precedence. Secret values are never logged or returned by the API.

Store the NASA key once (the hidden paste is not written to shell history):

```zsh
read -r -s 'NASA_FIRMS_MAP_KEY?Paste the NASA FIRMS key, then press Enter: '
printf '\n'
/usr/bin/security add-generic-password -U -a "$USER" -s vigia-nasa-firms-map-key -w "$NASA_FIRMS_MAP_KEY"
unset NASA_FIRMS_MAP_KEY
```

Store the Copernicus account once:

```zsh
read -r 'VIGIA_CDSE_USERNAME?Copernicus login: '
read -r -s 'VIGIA_CDSE_PASSWORD?Copernicus password, then press Enter: '
printf '\n'
/usr/bin/security add-generic-password -U -a "$USER" -s vigia-cdse-username -w "$VIGIA_CDSE_USERNAME"
/usr/bin/security add-generic-password -U -a "$USER" -s vigia-cdse-password -w "$VIGIA_CDSE_PASSWORD"
unset VIGIA_CDSE_USERNAME VIGIA_CDSE_PASSWORD
```

Restart VIGIA after storing a credential. Set `VIGIA_KEYCHAIN_DISABLED=1` to disable the fallback. The runtime looks up only the service names shown above under the current macOS account.
