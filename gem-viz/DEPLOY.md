# Deployment Setup

GEM Viz deploys to **Digital Ocean Spaces** (S3-compatible storage).

## Why Not Cloudflare Pages?

Pages has a 20,000 file limit. We have 62,000+ prerendered asset pages. Non-starter.

## Prerequisites

### 1. AWS CLI

```bash
brew install awscli
```

### 2. Digital Ocean Spaces Credentials

Get these from Digital Ocean console:
1. Go to **API** → **Spaces Keys**
2. Generate a new key
3. Save the **Access Key** and **Secret Key**

### 3. Configure AWS CLI Profile

```bash
aws configure --profile do-tor1
```

Enter:
- **AWS Access Key ID:** your DO Spaces access key
- **AWS Secret Access Key:** your DO Spaces secret key
- **Default region name:** `sfo3`
- **Default output format:** `json`

## Deploy

```bash
just ship
```

This will:
1. Build spatial tiles from MotherDuck
2. Build the static site (62k+ pages, ~20 min)
3. Upload to `s3://ejthirdbear/gem-viz/`

## Configuration

The deploy script uses these defaults (override via env vars):

| Variable | Default | Description |
|----------|---------|-------------|
| `DO_SPACES_BUCKET` | `ejthirdbear` | Bucket name |
| `DO_SPACES_REGION` | `sfo3` | Region |
| `DO_SPACES_ENDPOINT` | `https://sfo3.digitaloceanspaces.com` | Endpoint URL |

## Result

Site will be at:
```
https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/
```

## Important: CORS Headers

For DuckDB WASM to work, the CDN/proxy serving this needs these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These can't be set on Spaces directly. Use CloudFlare, CloudFront, or nginx in front.
