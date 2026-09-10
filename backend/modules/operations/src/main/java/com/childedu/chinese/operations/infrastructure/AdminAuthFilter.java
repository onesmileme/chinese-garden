package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.application.AdminTokenDigest;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.filter.OncePerRequestFilter;

/** 对管理端点执行管理员身份解析和 IPv4/CIDR 来源限制。 */
public class AdminAuthFilter extends OncePerRequestFilter {

  public static final String TOKEN_HEADER = "X-Admin-Token";
  public static final String ACTOR_ATTRIBUTE = AdminRequestAttributes.ACTOR;
  public static final String ROLES_ATTRIBUTE = AdminRequestAttributes.ROLES;

  private final AdminPrincipalRepository principals;
  private final List<Ipv4Cidr> allowedIps;

  public AdminAuthFilter(AdminPrincipalRepository principals, String allowedIps) {
    if (principals == null) {
      throw new IllegalArgumentException("admin principal repository must not be null");
    }
    this.principals = principals;
    this.allowedIps = parseAllowList(allowedIps);
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/v1/admin/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!isAllowed(request.getRemoteAddr())) {
      response.setStatus(HttpServletResponse.SC_FORBIDDEN);
      return;
    }

    String suppliedToken = request.getHeader(TOKEN_HEADER);
    if (suppliedToken == null || suppliedToken.isBlank()) {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      return;
    }

    AdminPrincipal principal =
        principals.findByTokenDigest(AdminTokenDigest.sha256(suppliedToken)).orElse(null);
    if (principal == null) {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      return;
    }
    if (!principal.active() || principal.roles().isEmpty()) {
      response.setStatus(HttpServletResponse.SC_FORBIDDEN);
      return;
    }

    request.setAttribute(ACTOR_ATTRIBUTE, principal.actor());
    request.setAttribute(ROLES_ATTRIBUTE, principal.roles());
    filterChain.doFilter(request, response);
  }

  private boolean isAllowed(String sourceAddress) {
    Integer source = parseIpv4(sourceAddress);
    return source != null && allowedIps.stream().anyMatch(range -> range.contains(source));
  }

  private static List<Ipv4Cidr> parseAllowList(String configured) {
    if (configured == null || configured.isBlank()) {
      throw new IllegalArgumentException("admin allowed IPs must not be blank");
    }
    List<Ipv4Cidr> ranges = new ArrayList<>();
    for (String rawEntry : configured.split(",", -1)) {
      String entry = rawEntry.trim();
      if (entry.isEmpty()) {
        throw new IllegalArgumentException("admin allowed IPs contains a blank entry");
      }
      ranges.add(parseCidr(entry));
    }
    return List.copyOf(ranges);
  }

  private static Ipv4Cidr parseCidr(String entry) {
    String[] parts = entry.split("/", -1);
    if (parts.length > 2 || parts[0].isBlank()) {
      throw new IllegalArgumentException("invalid IPv4 allow-list entry: " + entry);
    }
    Integer network = parseIpv4(parts[0]);
    if (network == null) {
      throw new IllegalArgumentException("invalid IPv4 allow-list entry: " + entry);
    }
    int prefix = 32;
    if (parts.length == 2) {
      try {
        prefix = Integer.parseInt(parts[1]);
      } catch (NumberFormatException e) {
        throw new IllegalArgumentException("invalid IPv4 allow-list entry: " + entry, e);
      }
    }
    if (prefix < 0 || prefix > 32) {
      throw new IllegalArgumentException("invalid IPv4 allow-list entry: " + entry);
    }
    return new Ipv4Cidr(network, prefix);
  }

  private static Integer parseIpv4(String value) {
    if (value == null) {
      return null;
    }
    String[] octets = value.split("\\.", -1);
    if (octets.length != 4) {
      return null;
    }
    int result = 0;
    for (String octet : octets) {
      if (octet.isEmpty() || !octet.chars().allMatch(Character::isDigit)) {
        return null;
      }
      int number;
      try {
        number = Integer.parseInt(octet);
      } catch (NumberFormatException e) {
        return null;
      }
      if (number > 255) {
        return null;
      }
      result = (result << 8) | number;
    }
    return result;
  }

  private record Ipv4Cidr(int network, int prefix) {

    boolean contains(int address) {
      int mask = prefix == 0 ? 0 : -1 << (32 - prefix);
      return (network & mask) == (address & mask);
    }
  }
}
