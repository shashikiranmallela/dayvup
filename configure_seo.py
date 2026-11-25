"""Generate static SEO metadata for the real published root URL."""
import argparse, json, re, html
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('site_url', help='Actual public HTTPS root URL, e.g. your existing Render static-site URL')
args = parser.parse_args()
u = urlsplit(args.site_url.strip())
if (u.scheme != 'https' or not u.hostname or '.' not in u.hostname or u.path not in ('','/') or u.query or u.fragment or u.username or u.password or u.port or u.hostname in ('example.com','example.org','example.net') or u.hostname.endswith(('.example','.invalid','.localhost')) or not re.fullmatch(r'[a-zA-Z0-9.-]+',u.hostname)):
    parser.error('Enter your actual public HTTPS hostname, without a path or query.')
url = 'https://' + u.hostname.lower() + '/'
front = Path(__file__).resolve().parent / 'frontend'
site = {'@context':'https://schema.org','@type':'WebSite','name':'Dayvup','alternateName':'Dayvup Workspace','url':url}
image = url + 'dayvup-social.png'
metadata = '\n'.join([f'<link rel="canonical" href="{html.escape(url,quote=True)}">',f'<meta property="og:url" content="{html.escape(url,quote=True)}">',f'<meta property="og:image" content="{html.escape(image,quote=True)}">','<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Dayvup — Level up your day.">',f'<meta name="twitter:image" content="{html.escape(image,quote=True)}">','<meta name="twitter:image:alt" content="Dayvup — Level up your day.">', '<script type="application/ld+json">'+json.dumps(site,ensure_ascii=False)+'</script>'])
p=front/'index.html'
s=p.read_text(encoding='utf-8')
s,n=re.subn(r'<!-- SEO_URLS_START -->.*?<!-- SEO_URLS_END -->',lambda _: '<!-- SEO_URLS_START -->\n'+metadata+'\n<!-- SEO_URLS_END -->',s,flags=re.S)
if n!=1: raise SystemExit('Expected one SEO metadata block; no files modified.')
p.write_text(s,encoding='utf-8')
(front/'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {url}sitemap.xml\n',encoding='utf-8')
(front/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>'+escape(url)+'</loc></url>\n</urlset>\n',encoding='utf-8')
print('SEO configured for',url,'\nDeploy frontend, then submit',url+'sitemap.xml','in Google Search Console.')
