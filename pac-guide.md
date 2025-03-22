# Using PAC Files with Proxy Switcher

## What is a PAC File?

A PAC (Proxy Auto-Configuration) file is a JavaScript file that determines which proxy server (if any) to use for a given URL. PAC files give you more flexibility than a single proxy configuration by allowing you to:

- Route different URLs through different proxies
- Access some URLs directly without a proxy
- Make conditional decisions based on hostnames, domains, IP addresses, etc.

## How to Create a PAC File

A PAC file contains a single JavaScript function called `FindProxyForURL(url, host)` that returns a string indicating how to access a given URL.

### Example PAC File

```javascript
function FindProxyForURL(url, host) {
  // Variables for different proxy configurations
  var direct = "DIRECT";
  var proxy1 = "PROXY proxy1.example.com:8080";
  var proxy2 = "PROXY proxy2.example.com:8080";
  var socks = "SOCKS5 socks-proxy.example.com:1080";
  
  // Example: Use SOCKS proxy for specific domains
  if (shExpMatch(host, "*.internal-site.com")) {
    return socks;
  }
  
  // Example: Route through different proxies based on URL patterns
  if (shExpMatch(url, "http://secure-site.com/*")) {
    return proxy1;
  }
  
  // Default route for all other traffic
  return proxy2;
}
```

### Common PAC Functions

PAC files can use these built-in functions:

- `isPlainHostName(host)`: True if the hostname has no dots
- `dnsDomainIs(host, domain)`: True if the host ends with the domain
- `shExpMatch(str, pattern)`: Shell-expression match (supports * and ? wildcards)
- `isInNet(host, pattern, mask)`: True if the host IP is in the specified subnet
- `dnsResolve(host)`: Resolves the hostname to an IP address
- `myIpAddress()`: Gets the IP address of the client

## Using PAC Files with This Extension

1. Create your PAC file and host it on a web server or locally (file:// URLs also work)
2. In the Proxy Switcher extension:
   - Click the "PAC File" tab
   - Enter a name for your configuration
   - Enter the URL to your PAC file
   - Click "Add PAC Configuration"

### Hosting Options

- **Web Server**: Upload to any web server (must be accessible via HTTP/HTTPS)
- **GitHub Gist**: Create a Gist and use the raw URL
- **Local File**: Use `file:///path/to/your/proxy.pac` (local only, not synced)

## Troubleshooting PAC Files

If your PAC file isn't working:

1. Check the Chrome developer console for errors
2. Verify the PAC file is accessible (try opening the URL directly)
3. Test your PAC script logic using the [PAC file tester tool](https://findproxyforurl.com/)
4. Ensure your proxy servers are actually running and accessible
5. Look for syntax errors in your PAC file

## Security Considerations

- PAC files are loaded and executed in the browser, so they need to be from trusted sources
- For security, Chrome requires PAC files to be properly MIME-typed as `application/x-ns-proxy-autoconfig` or `application/x-javascript-config`
- HTTPS URLs for PAC files are more secure than HTTP

## Advanced PAC Techniques

- Implement failover by returning multiple proxies: `return "PROXY primary:8080; PROXY backup:8080; DIRECT";`
- Create time-based rules using JavaScript's Date object
- Load-balance across multiple proxies using random selection
