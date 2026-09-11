#!/usr/bin/env python3
"""生成 FileDock 文件夹样式图标 - 填满整个画布，无透明边框"""
import struct
import zlib

def create_png(width, height, pixels):
    """创建 PNG 文件"""
    def make_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
        return struct.pack('>I', len(data)) + chunk_type + data + crc

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            idx = (y * width + x) * 4
            raw_data += bytes(pixels[idx:idx+4])
    compressed = zlib.compress(raw_data)
    return signature + make_chunk(b'IHDR', ihdr) + make_chunk(b'IDAT', compressed) + make_chunk(b'IEND', b'')

def draw_folder_icon(size):
    pixels = [0] * (size * size * 4)

    def set_pixel(x, y, r, g, b, a=255):
        if 0 <= x < size and 0 <= y < size:
            idx = (y * size + x) * 4
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = a

    def fill_rect(x1, y1, x2, y2, r, g, b, a=255):
        for y in range(max(0, y1), min(size, y2)):
            for x in range(max(0, x1), min(size, x2)):
                set_pixel(x, y, r, g, b, a)

    def round_rect(x1, y1, x2, y2, r, g, b, radius, a=255):
        for y in range(max(0, y1), min(size, y2)):
            for x in range(max(0, x1), min(size, x2)):
                in_corner = False
                corners = [(x1+radius, y1+radius), (x2-radius-1, y1+radius),
                          (x1+radius, y2-radius-1), (x2-radius-1, y2-radius-1)]
                for cx, cy in corners:
                    if (x < x1+radius or x > x2-radius-1) and (y < y1+radius or y > y2-radius-1):
                        dx = x - cx
                        dy = y - cy
                        if dx*dx + dy*dy > radius*radius:
                            in_corner = True
                            break
                if not in_corner:
                    set_pixel(x, y, r, g, b, a)

    s = size
    # 先填充不透明背景（浅灰渐变），保证托盘图标不透明
    for y in range(s):
        for x in range(s):
            # 浅灰背景，带轻微渐变
            t = y / s
            r = int(240 - t * 20)
            g = int(240 - t * 20)
            b = int(245 - t * 15)
            set_pixel(x, y, r, g, b, 255)

    # 文件夹颜色
    body_color = (37, 99, 235)       # #2563eb 主体
    tab_color = (59, 130, 246)       # #3b82f6 顶部凸起

    # 文件夹顶部凸起部分（tab）- 占满宽度的大部分
    tab_x1 = int(s * 0.08)
    tab_y1 = int(s * 0.10)
    tab_x2 = int(s * 0.55)
    tab_y2 = int(s * 0.26)
    tab_radius = max(2, int(s * 0.04))
    round_rect(tab_x1, tab_y1, tab_x2, tab_y2, tab_color[0], tab_color[1], tab_color[2], tab_radius)

    # 文件夹主体 - 填满大部分画布
    body_x1 = int(s * 0.05)
    body_y1 = int(s * 0.22)
    body_x2 = int(s * 0.95)
    body_y2 = int(s * 0.85)
    body_radius = max(3, int(s * 0.06))
    round_rect(body_x1, body_y1, body_x2, body_y2, body_color[0], body_color[1], body_color[2], body_radius)

    # 文件夹打开的部分（白色纸张）
    paper_x1 = int(s * 0.12)
    paper_y1 = int(s * 0.32)
    paper_x2 = int(s * 0.88)
    paper_y2 = int(s * 0.78)
    paper_radius = max(2, int(s * 0.03))
    round_rect(paper_x1, paper_y1, paper_x2, paper_y2, 255, 255, 255, paper_radius)

    # 纸张上的线条
    line_color = (191, 219, 254)
    for i in range(3):
        ly = paper_y1 + int((paper_y2 - paper_y1) * (0.25 + i * 0.22))
        fill_rect(paper_x1 + int(s*0.04), ly, paper_x2 - int(s*0.04), ly + max(1, int(s*0.018)),
                  line_color[0], line_color[1], line_color[2])

    return pixels

size = 256
pixels = draw_folder_icon(size)
png_data = create_png(size, size, pixels)

with open('/workspace/build/icon.png', 'wb') as f:
    f.write(png_data)

print(f"Generated icon: {len(png_data)} bytes")
