#!/usr/bin/env python3
"""生成 FileDock 默认图标 - 使用 Pillow，4x 超采样抗锯齿"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = '/workspace/build/icons'
os.makedirs(OUT_DIR, exist_ok=True)

SS = 4  # 超采样倍数
SIZE = 256


def new_canvas():
    """创建超采样画布"""
    return Image.new('RGBA', (SIZE * SS, SIZE * SS), (0, 0, 0, 0))


def finalize(img, name):
    """降采样到目标尺寸并保存"""
    final = img.resize((SIZE, SIZE), Image.LANCZOS)
    final.save(os.path.join(OUT_DIR, name))
    print(f"Generated {name}")


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)


def gradient_fill(size, c1, c2, vertical=True):
    """生成渐变图"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    for i in range(size):
        t = i / (size - 1) if size > 1 else 0
        col = lerp_color(c1, c2, t)
        for j in range(size):
            if vertical:
                px[j, i] = col
            else:
                px[i, j] = col
    return img


def rounded_rect_mask(size, radius):
    """圆角矩形遮罩"""
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def paste_rounded(base, layer, box, radius):
    """把 layer 按圆角矩形裁剪后贴到 base 的 box 区域"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return
    layer_resized = layer.resize((w, h), Image.LANCZOS)
    mask = Image.new('L', (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    base.paste(layer_resized, (x0, y0), mask)


# ===== 图标1: 精致文件夹 =====
def make_folder():
    S = SIZE * SS
    img = new_canvas()
    d = ImageDraw.Draw(img)

    # 背景圆角矩形（浅色，保证不透明）
    bg = gradient_fill(S, (245, 247, 250), (225, 230, 238))
    bg_mask = rounded_rect_mask(S, int(SIZE * SS * 0.18))
    img.paste(bg, (0, 0), bg_mask)

    # 阴影
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([int(S*0.10), int(S*0.30), int(S*0.92), int(S*0.86)],
                         radius=int(S*0.05), fill=(30, 60, 120, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(S*0.012))
    img = Image.alpha_composite(img, shadow)
    d = ImageDraw.Draw(img)

    # 文件夹 tab（顶部凸起）
    tab_grad = gradient_fill(S, (96, 165, 250), (59, 130, 246))
    paste_rounded(img, tab_grad,
                  [int(S*0.14), int(S*0.14), int(S*0.52), int(S*0.30)],
                  int(S*0.035))

    # 文件夹主体
    body_grad = gradient_fill(S, (59, 130, 246), (37, 99, 235))
    paste_rounded(img, body_grad,
                  [int(S*0.08), int(S*0.26), int(S*0.92), int(S*0.82)],
                  int(S*0.05))

    # 高光（顶部亮带）
    hi = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.rounded_rectangle([int(S*0.10), int(S*0.28), int(S*0.90), int(S*0.36)],
                         radius=int(S*0.03), fill=(255, 255, 255, 55))
    img = Image.alpha_composite(img, hi)

    # 白色纸张
    paper_grad = gradient_fill(S, (255, 255, 255), (238, 244, 255))
    paste_rounded(img, paper_grad,
                  [int(S*0.16), int(S*0.36), int(S*0.84), int(S*0.74)],
                  int(S*0.025))

    # 纸张线条
    d = ImageDraw.Draw(img)
    line_color = (147, 197, 253, 230)
    for i in range(3):
        ly = int(S*0.44) + int(S*0.10) * i
        d.rounded_rectangle([int(S*0.21), ly, int(S*0.79), ly + int(S*0.018)],
                            radius=int(S*0.008), fill=line_color)

    finalize(img, 'folder.png')


# ===== 图标2: 仓库/收纳盒 =====
def make_warehouse():
    S = SIZE * SS
    img = new_canvas()

    # 背景圆角矩形
    bg = gradient_fill(S, (250, 248, 244), (228, 226, 220))
    bg_mask = rounded_rect_mask(S, int(SIZE * SS * 0.18))
    img.paste(bg, (0, 0), bg_mask)

    # 阴影
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([int(S*0.16), int(S*0.40), int(S*0.84), int(S*0.84)],
                         radius=int(S*0.04), fill=(80, 50, 20, 55))
    shadow = shadow.filter(ImageFilter.GaussianBlur(S*0.014))
    img = Image.alpha_composite(img, shadow)

    # 盒子前面板（暖色渐变）
    front = gradient_fill(S, (251, 191, 36), (217, 119, 6))
    paste_rounded(img, front,
                  [int(S*0.16), int(S*0.38), int(S*0.84), int(S*0.82)],
                  int(S*0.035))

    # 盒子顶部（深色，表示开口边缘）
    top = gradient_fill(S, (180, 83, 9), (146, 64, 14))
    paste_rounded(img, top,
                  [int(S*0.16), int(S*0.34), int(S*0.84), int(S*0.42)],
                  int(S*0.03))

    # 盒内深色（开口）
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([int(S*0.20), int(S*0.36), int(S*0.80), int(S*0.42)],
                        radius=int(S*0.015), fill=(92, 38, 10, 255))

    # 蓝色文件/标签（从盒子里露出来）
    file_grad = gradient_fill(S, (59, 130, 246), (37, 99, 235))
    # 三张露出的文件
    for fx_ratio, fh in [(0.26, 0.16), (0.40, 0.20), (0.54, 0.14)]:
        paste_rounded(img, file_grad,
                      [int(S*fx_ratio), int(S*0.22), int(S*(fx_ratio+0.14)), int(S*0.40)],
                      int(S*0.015))

    # 盒子前面板的标签条
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([int(S*0.24), int(S*0.58), int(S*0.76), int(S*0.66)],
                        radius=int(S*0.02), fill=(255, 255, 255, 200))
    # 标签上的线条
    for i in range(2):
        ly = int(S*0.605) + int(S*0.022) * i
        d.rounded_rectangle([int(S*0.28), ly, int(S*0.72), ly + int(S*0.012)],
                            radius=int(S*0.005), fill=(217, 119, 6, 200))

    # 高光
    hi = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.rounded_rectangle([int(S*0.18), int(S*0.40), int(S*0.30), int(S*0.80)],
                         radius=int(S*0.02), fill=(255, 255, 255, 40))
    img = Image.alpha_composite(img, hi)

    finalize(img, 'warehouse.png')


# ===== 图标3: 字母 F 极简风 =====
def make_monogram():
    S = SIZE * SS
    img = new_canvas()

    # 背景圆角方形（蓝紫渐变）
    bg = gradient_fill(S, (99, 102, 241), (37, 99, 235))
    # 对角渐变：旋转一下
    bg2 = gradient_fill(S, (139, 92, 246), (59, 130, 246), vertical=False)
    bg = Image.blend(bg, bg2, 0.5)
    bg_mask = rounded_rect_mask(S, int(SIZE * SS * 0.22))
    img.paste(bg, (0, 0), bg_mask)

    # 柔和光晕（右上角）
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([int(S*0.45), int(S*0.05), int(S*1.05), int(S*0.65)],
               fill=(255, 255, 255, 50))
    glow = glow.filter(ImageFilter.GaussianBlur(S*0.06))
    img = Image.alpha_composite(img, glow)

    # 绘制字母 F（白色，带柔和阴影）
    d = ImageDraw.Draw(img)
    # F 的笔画用粗矩形构成
    sw = int(S * 0.13)   # 笔画宽度
    # 竖笔
    d.rounded_rectangle([int(S*0.32), int(S*0.22), int(S*0.32+sw), int(S*0.78)],
                        radius=int(S*0.03), fill=(255, 255, 255, 255))
    # 上横笔
    d.rounded_rectangle([int(S*0.32), int(S*0.22), int(S*0.70), int(S*0.22+sw)],
                        radius=int(S*0.03), fill=(255, 255, 255, 255))
    # 中横笔（较短）
    d.rounded_rectangle([int(S*0.32), int(S*0.44), int(S*0.62), int(S*0.44+sw)],
                        radius=int(S*0.03), fill=(255, 255, 255, 255))

    # F 的细微阴影（增加层次）
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    offset = int(S*0.015)
    sd.rounded_rectangle([int(S*0.32)+offset, int(S*0.22)+offset, int(S*0.32+sw)+offset, int(S*0.78)+offset],
                         radius=int(S*0.03), fill=(30, 27, 75, 60))
    sd.rounded_rectangle([int(S*0.32)+offset, int(S*0.22)+offset, int(S*0.70)+offset, int(S*0.22+sw)+offset],
                         radius=int(S*0.03), fill=(30, 27, 75, 60))
    sd.rounded_rectangle([int(S*0.32)+offset, int(S*0.44)+offset, int(S*0.62)+offset, int(S*0.44+sw)+offset],
                         radius=int(S*0.03), fill=(30, 27, 75, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(S*0.008))
    # 先贴阴影再贴白色 F
    img2 = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    img2.paste(img, (0, 0))
    img2 = Image.alpha_composite(img2, shadow)
    # 重画白色 F 在最上层
    d2 = ImageDraw.Draw(img2)
    d2.rounded_rectangle([int(S*0.32), int(S*0.22), int(S*0.32+sw), int(S*0.78)],
                         radius=int(S*0.03), fill=(255, 255, 255, 255))
    d2.rounded_rectangle([int(S*0.32), int(S*0.22), int(S*0.70), int(S*0.22+sw)],
                         radius=int(S*0.03), fill=(255, 255, 255, 255))
    d2.rounded_rectangle([int(S*0.32), int(S*0.44), int(S*0.62), int(S*0.44+sw)],
                         radius=int(S*0.03), fill=(255, 255, 255, 255))

    finalize(img2, 'monogram.png')


if __name__ == '__main__':
    make_folder()
    make_warehouse()
    make_monogram()
    print("All icons generated to", OUT_DIR)
