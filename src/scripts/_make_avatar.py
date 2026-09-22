import numpy as np
from PIL import Image, ImageFilter
import math

S = 1024
CX = CY = S//2

# ================= RUIDO VALUE-NOISE VECTORIZADO =================
def make_hash(seed):
    rng = np.random.default_rng(seed)
    p = rng.permutation(512)
    return p

def value_noise_2d(xx, yy, perm, period=256):
    xi = np.floor(xx).astype(np.int64) & (period-1)
    yi = np.floor(yy).astype(np.int64) & (period-1)
    xf = xx - np.floor(xx); yf = yy - np.floor(yy)
    # interp bicúbica suave (quintic)
    u = xf*xf*xf*(xf*(xf*6-15)+10)
    v = yf*yf*yf*(yf*(yf*6-15)+10)
    a = perm[xi & 255]
    b = perm[(xi+1) & 255]
    c = perm[(xi & 255)+1]  # (las filas siguientes)
    # mejor: uso perm índice 2D:
    def idx(px, py):
        return perm[((perm[px & 255] + py) & 255)]
    v00 = ((perm[((perm[xi & 255].astype(np.int64)) + yi) & 255]) & 0xffff)/65535.0
    v10 = ((perm[((perm[(xi+1) & 255].astype(np.int64)) + yi) & 255]) & 0xffff)/65535.0
    v01 = ((perm[((perm[xi & 255].astype(np.int64)) + yi+1) & 255]) & 0xffff)/65535.0
    v11 = ((perm[((perm[(xi+1) & 255].astype(np.int64)) + yi+1) & 255]) & 0xffff)/65535.0
    x1 = v00 + (v10-v00)*u
    x2 = v01 + (v11-v01)*u
    return x1 + (x2-x1)*v

# NOTA: perm con 0..255 valores; uso /65535 pierde rango, forzar 0-1
def _norm(perm):
    # perm debería ser [0,512) flotante; reescalamos a 0..1
    return (perm % 256)/256.0

def vnoise(xx, yy, perm):
    xi = np.floor(xx).astype(np.int64)
    yi = np.floor(yy).astype(np.int64)
    xf = xx-xi; yf = yy-yi
    u = xf*xf*xf*(xf*(xf*6-15)+10)
    v = yf*yf*yf*(yf*(yf*6-15)+10)
    P = perm % 256
    A = P[xi & 255]
    B = P[(xi+1) & 255]
    C = P[(A + (yi & 255)) & 255]/256.0
    D = P[(B + (yi & 255)) & 255]/256.0
    E = P[(A + (yi+1) & 255) & 255]/256.0
    F = P[(B + (yi+1) & 255) & 255]/256.0
    return C + (D-C)*u + (E-C)*v + (C-D-F+E)*u*v

def fbm2d(xx, yy, perm, octaves=6, lac=2.0, gain=0.5):
    amp=1.0; fr=1.0
    tot=np.zeros_like(xx, dtype=float); nf=0.0
    for _ in range(octaves):
        tot += amp*vnoise(xx*fr, yy*fr, perm)
        nf += amp; amp*=gain; fr*=lac
    return tot/nf

permA = make_hash(1234).astype(np.int64)
permB = make_hash(99).astype(np.int64)
permC = make_hash(7).astype(np.int64)

yyg, xxg = np.mgrid[0:S, 0:S].astype(float)
fx = (xxg/S)*5.0
fy = (yyg/S)*5.0

# ================= FONDO ESPACIO =================
rr = np.sqrt(((xxg-S/2)/S)**2 + ((yyg-S/2)/S)**2)
base = np.zeros((S, S, 3), dtype=float)
base[..., 0] = 4 + 18*rr
base[..., 1] = 6 + 22*rr
base[..., 2] = 14 + 34*rr

# nebulosa FBM (vectorizado)
n_r = fbm2d(fx, fy, permA, 7)
n_g = fbm2d(fx, fy, permB, 7)
n_b = fbm2d(fx+7, fy-9, permC, 6)
pink=np.array([255,90,170]); violet=np.array([165,80,240]); cyan=np.array([80,180,255])
gas = np.zeros((S,S,3),float)
gas[...,0] += pink[0]*0.5*np.clip(n_r,0,1)**2 + violet[0]*0.4*np.clip(n_b,0,1)**2
gas[...,1] += pink[1]*0.5*np.clip(n_r,0,1)**2 + violet[1]*0.4*np.clip(n_b,0,1)**2 + cyan[1]*0.3*np.clip(n_g,0,1)
gas[...,2] += pink[2]*0.5*np.clip(n_r,0,1)**2 + violet[2]*0.4*np.clip(n_b,0,1)**2 + cyan[2]*0.3*np.clip(n_g,0,1)
dust = np.clip(fbm2d(fx*2+3, fy*2-3, permB, 5), 0, 1)
gas *= (1 - 0.7*np.clip(dust-0.5,0,1)**1.5)[...,None]
base += gas

# ================= ESPIRAL =================
dxg = xxg-CX; dyg = yyg-CY
Rg = np.sqrt(dxg*dxg+dyg*dyg)
THg = np.arctan2(dyg, dxg)
arms=3; tight=0.32
d = np.abs(np.mod(THg - tight*np.log(Rg+1e-3), 2*np.pi/arms))
d = np.minimum(d, 2*np.pi/arms - d)
sigma = 0.14 + 0.25*np.clip((Rg-120)/800,0,1)
dens = np.exp(-(d*d)/(2*sigma**2))
dens += np.exp(-(Rg/80)**2)*2.0
dens *= 1-np.exp(-(Rg/40)**2)*0.8
dens_s = dens/np.max(dens)
base += dens_s[...,None]*np.array([255,240,220])*0.5
base += dens_s[...,None]*np.array([120,90,255])*0.35

arr = np.clip(base,0,255).astype(float)

# ================= ESTRELLAS =================
rng = np.random.default_rng(7)
n_ss=2600
sx=rng.integers(0,S,n_ss); sy=rng.integers(0,S,n_ss)
sbr=rng.uniform(0.3,1.0,n_ss); scol=rng.uniform(0.8,1.1,(n_ss,3))
arr[sy,sx]+=sbr[:,None]*scol*255
# estrellas grandes con spikes (vectorizado de gaussiana alrededor)
for i in range(16):
    bx=int(rng.integers(40,S-40)); by=int(rng.integers(40,S-40)); Rst=int(rng.integers(5,9))
    # convertir a mesh local
    Rsm=Rst*5
    lx,ly=np.mgrid[-Rsm:Rsm+1,-Rsm:Rsm+1].astype(float)
    xxc=bx+lx; yyc=by+ly; mask=(xxc>=0)&(xxc<S)&(yyc>=0)&(yyc<S)
    dist=np.hypot(lx,ly)
    ag=np.abs(np.mod(np.arctan2(ly,lx),math.pi/2))
    spike=np.where(ag<0.18, np.cos(ag*7), 0.0)
    core=np.clip(1-dist/Rst,0,1); halo2=np.clip(1-dist/(Rsm),0,1)
    v=core+halo2*0.4+spike*0.6*np.clip(1-dist/(Rst*2.6),0,1)
    vv=v*255*1.3
    yyf=yyc[mask].astype(np.int64); xxf=xxc[mask].astype(np.int64); vvf=vv[mask]
    np.add.at(arr, (yyf, xxf), vvf[:,None])

# ================= PLANETA ESFÉRICO VECTORIZADO =================
PR=190; pcx, pcy=CX, CY-6
dygp = yyg - pcy; dxgp = xxg - pcx
rrp = np.sqrt(dxgp*dxgp+dygp*dygp)
inp = rrp <= PR
# obtener z (proyección esférica) solo dentro
z = np.where(inp, np.sqrt(np.clip(PR*PR - rrp*rrp,0,None)), 0)
# coordenadas angulares
lat = np.arcsin(np.clip(z/PR,-1,1))     # 0..pi/2
lon = np.arctan2(dygp, dxgp)            # -pi..pi
u = (lon+math.pi)/(2*math.pi)*8
v = (lat+math.pi/2)/math.pi*8           # NO, lat va 0..pi/2 → v 0..1*4
v2 = (lat)/(math.pi)*8
n1 = fbm2d(u, v2, permA, 7)
n2 = fbm2d(u+20, v2-10, permC, 7)
deep = np.clip(n1*0.7+0.5,0,1)
eng = np.clip((n2*0.6+0.5-0.45)*3,0,1)**1.5
# color
col = np.zeros((S,S,3),float)
col[...,0] = (40*(1-deep)+20*deep)
col[...,1] = (70*(1-deep)+30*deep)
col[...,2] = (140*(1-deep)+80*deep)
col += np.array([255,245,200])[None,None,:]*eng[...,None]*0.5
# iluminación esférica + limb
light=(dygp<-0.3*PR)*0.4+0.6
nd=z/PR
shade=np.clip(0.25,0,1)*0+np.clip(light*(0.35+0.65*nd),0.25,1)
limb=np.where(inp, np.clip((np.clip(1-rrp*rrp/(PR*PR),0,None))**0.25,0,1), 0.0)
planet=col*shade[...,None]*(0.6+0.4*limb[...,None])
# término brillante
term=np.abs(limb-0.55)<0.1
term &= inp
planet[term]+=np.array([120,90,255])*2.0

alpha=np.where(inp,1.0,0.0)

# ================= ANILLOS =================
ry_scale=0.42
ring_outer=PR*2.55; ring_inner=PR*1.35
# máscara del anillo (elipse achatada), detrás: parte superior
radr = np.sqrt(dxgp*dxgp + (dygp/ry_scale)**2)
inring=(radr>=ring_inner)&(radr<=ring_outer)
band=0.5+0.5*np.sin(radr*7 + fbm2d(xxg*0.03, yyg*0.03, permA,2)*5)
hole=0.4+0.6*np.clip(fbm2d(xxg*0.01, yyg*0.01, permA,3),0,1)
ringc=np.array([200,190,220])[None,None,:]*(band[...,None])*(0.35+0.65*band[...,None])  # ajuste
# rehago clear:
ringc = np.zeros((S,S,3),float)
ringc[...,0]=200*(0.35+0.65*band)
ringc[...,1]=190*(0.35+0.65*band)
ringc[...,2]=220*(0.35+0.65*band)
# 'detrás' = filas superiores (y < pcy) ; 'delante' = inferiores
behind = inring & (dygp < 0)
front = inring & (dygp >= 0)
# anillo detrás
arr += ringc*behind[...,None]*hole[...,None]*0.9
# planeta (tapa el anillo trasero)
arr = arr*(1-alpha[...,None]) + planet*alpha[...,None]
# anillo delante
arr += ringc*front[...,None]*hole[...,None]*0.95
arr = np.clip(arr,0,255)
arr = np.nan_to_num(arr)

result = Image.fromarray(arr.astype(np.uint8),'RGB')

# ================= BLOOM =================
glow = result.filter(ImageFilter.GaussianBlur(10))
result = Image.blend(result, glow, 0.45).filter(ImageFilter.GaussianBlur(0.5))

out="C:\\Users\\Matrix\\Desktop\\Nueva carpeta\\galaxy-bot-avatar.png"
result.save(out,'PNG')
print("OK:",out,result.size)
