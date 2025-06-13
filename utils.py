# utils.py

import math

def deg_to_rad(degrees):
    return degrees * math.pi / 180.0

def rad_to_deg(radians):
    return radians * 180.0 / math.pi

def angle_difference(angle1, angle2):
    return (angle1 - angle2 + 180) % 360 - 180

def normalize_angle(degrees):
    return degrees % 360

def lerp(a, b, t):
    return a + (b - a) * t

def distance_sq(p1, p2):
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2

def check_line_crossing(p1, p2, line_p1, line_p2):
    """
    Checks if the line segment p1-p2 crosses the line segment defined by
    line_p1 and line_p2. Returns True if crossing occurred ON the segment.
    """
    def orientation(p, q, r):
        val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
        if abs(val) < 1e-6: return 0  # Collinear
        return 1 if val > 0 else 2  # Clockwise or Counterclockwise

    o1 = orientation(line_p1, line_p2, p1)
    o2 = orientation(line_p1, line_p2, p2)
    o3 = orientation(p1, p2, line_p1)
    o4 = orientation(p1, p2, line_p2)

    if o1 != o2 and o3 != o4:
        return True

    return False

def format_time(seconds):
    """Formats seconds into MM:SS.ss"""
    # Check for invalid numbers like NaN or infinity to prevent crashing
    if seconds < 0 or not math.isfinite(seconds):
        return "--:--.--"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    hunds = int((seconds * 100) % 100)
    return f"{mins:02}:{secs:02}.{hunds:02}"