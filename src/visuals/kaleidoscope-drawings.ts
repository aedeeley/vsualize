/** Procedural ink illustrations. Each fits inside a radius of 0.40, allowing
 * seeded compositions to meet without clipping strokes at their boundaries. */
export const DRAWING_COUNT = 40;
export const DRAWING_NAMES = [
  'Flower', 'Eye', 'Leaf', 'Shell', 'Star', 'Butterfly', 'Mushroom', 'Sun',
  'Crescent', 'Planet', 'Comet', 'Constellation', 'Fish', 'Jellyfish', 'Dragonfly', 'Feather',
  'Fern', 'Tree', 'Lotus', 'Heart', 'Infinity', 'Crystal', 'Mountains', 'Cloud',
  'Flame', 'Wave', 'Hourglass', 'Key', 'Lantern', 'Rocket', 'Galaxy', 'Snowflake',
  'Owl', 'Cat', 'Turtle', 'Octopus', 'Rose', 'Cactus', 'Bee', 'Crown',
] as const;

export const DRAWINGS = `
float ovalInk(vec2 p,vec2 axes) {
  // Normalize by the ellipse gradient, not its short axis: the old formula
  // made the long ends several times thicker than the sides.
  float k=length(p/axes);
  return abs(k-1.0)/max(length(p/(axes*axes))/max(k,0.00001),0.00001);
}
float curveInk(vec2 p,vec2 a,vec2 b,vec2 c) {
  float d=1e4; vec2 last=a;
  for(int i=1;i<=16;i++) {
    float t=float(i)/16.0;
    vec2 next=mix(mix(a,b,t),mix(b,c,t),t);
    d=min(d,segment(p,last,next)); last=next;
  }
  return d;
}
float ringInk(vec2 p,float radius) { return abs(length(p)-radius); }
float arcInk(vec2 p,vec2 center,float radius,float lo,float hi) {
  vec2 q=p-center;
  float a=clamp(atan(q.y,q.x),lo,hi);
  return length(q-radius*vec2(cos(a),sin(a)));
}
float boxInk(vec2 p,vec2 halfSize) {
  vec2 q=abs(p)-halfSize;
  return abs(length(max(q,0.0))+min(max(q.x,q.y),0.0));
}
float drawing(vec2 p,float kind,float seed,float detail) {
  float r=length(p),a=atan(p.y,p.x),d=1.0;
  float lobes=3.0+floor(seed*6.0);
  vec2 mirror=vec2(abs(p.x),p.y);
  if(kind<1.0) {
    float petal=0.25+0.075*cos(a*lobes);
    d=min(abs(r-petal),abs(r-0.065));
    if(detail>0.5) d=min(d,abs(r-petal*0.62));
  } else if(kind<2.0) {
    d=curveInk(vec2(p.x,abs(p.y)),vec2(-0.32,0),vec2(0,0.29),vec2(0.32,0));
    d=min(d,abs(r-0.092));
    if(detail>0.5) {
      d=min(d,abs(r-0.037));
      for(int i=0;i<3;i++) {
        float x=float(i)*0.10,y=0.145*(1.0-x*x/0.1024);
        d=min(d,segment(mirror,vec2(x,y),vec2(x*1.12,y+0.045)));
      }
    }
  } else if(kind<3.0) {
    float leaf=0.18*pow(max(0.0,1.0-abs(p.y)/0.35),0.70);
    d=max(abs(abs(p.x)-leaf)*0.8,abs(p.y)-0.35);
    d=min(d,segment(p,vec2(0,-0.37),vec2(0,0.32)));
    if(detail>0.5) d=min(d,max(abs(sin((p.y-abs(p.x)*0.85)*32.0))*0.027,max(abs(p.x)-leaf+0.025,abs(p.y)-0.29)));
  } else if(kind<4.0) {
    // A single joined spiral, rather than clipped sine bands and spiky rays.
    vec2 last=vec2(0.025,0);
    for(int i=1;i<=48;i++) {
      float t=float(i)/48.0,angle=t*PI*4.0;
      vec2 next=(0.025+t*0.295)*vec2(cos(angle),sin(angle));
      d=min(d,segment(p,last,next)); last=next;
    }
  } else if(kind<5.0) {
    float star=0.23+0.085*cos(a*lobes);
    d=abs(r-star)*0.7;
    if(detail>0.5) d=min(d,abs(r-star*0.55)*0.7);
    d=min(d,abs(abs(p.x)+abs(p.y)-0.042)*0.7);
  } else if(kind<6.0) {
    d=curveInk(mirror,vec2(0.03,0.09),vec2(0.37,0.38),vec2(0.30,0.03));
    d=min(d,curveInk(mirror,vec2(0.30,0.03),vec2(0.27,-0.30),vec2(0.035,-0.10)));
    d=min(d,ovalInk(p,vec2(0.030,0.17)));
    d=min(d,segment(mirror,vec2(0.015,0.15),vec2(0.065,0.24)));
    if(detail>0.5) d=min(d,ovalInk(mirror-vec2(0.18,0.09),vec2(0.045,0.06)));
  } else if(kind<7.0) {
    // Mushroom cap, curved stem and spots.
    d=max(ovalInk(p-vec2(0,0.06),vec2(0.30,0.22)),0.06-p.y);
    d=min(d,segment(p,vec2(-0.30,0.06),vec2(0.30,0.06)));
    d=min(d,segment(mirror,vec2(0.065,0.06),vec2(0.08,-0.29)));
    d=min(d,arcInk(p,vec2(0,-0.29),0.08,-PI,0.0));
    if(detail>0.5) d=min(d,ringInk(mirror-vec2(0.13,0.15),0.037));
  } else if(kind<8.0) {
    d=ringInk(p,0.18);
    float rayCount=6.0+floor(seed*4.0);
    float rays=abs(sin(a*rayCount))*r/rayCount;
    d=min(d,max(rays,max(0.23-r,r-0.35)));
    if(detail>0.5) d=min(d,ringInk(p,0.13));
  } else if(kind<9.0) {
    // Crescent is the boundary of one disc cut by another.
    d=abs(max(r-0.30,0.28-length(p-vec2(0.13,0.06))));
    d=min(d,ringInk(p-vec2(0.20,0.20),0.032));
  } else if(kind<10.0) {
    vec2 q=rot(0.40)*p;
    d=ringInk(p,0.20);
    float orbit=ovalInk(q,vec2(0.36,0.095));
    d=min(d,max(orbit,min(q.y,0.20-r)));
    if(detail>0.5) d=min(d,max(abs(p.y+0.055+0.025*sin(p.x*14.0)),r-0.19));
  } else if(kind<11.0) {
    d=ringInk(p-vec2(-0.13,-0.12),0.10);
    for(int i=0;i<3;i++) {
      float k=float(i),theta=0.25+k*0.53;
      vec2 start=vec2(-0.13,-0.12)+0.10*vec2(cos(theta),sin(theta));
      d=min(d,segment(p,start,start+vec2(0.18,0.28)));
    }
  } else if(kind<12.0) {
    vec2 last=vec2(-0.25,-0.20);
    d=ringInk(p-last,0.029);
    for(int i=0;i<4;i++) {
      float k=float(i);
      vec2 next=vec2(-0.14+k*0.12,0.20*sin(k*2.1+seed*3.0));
      vec2 direction=normalize(next-last);
      d=min(d,min(segment(p,last+direction*0.029,next-direction*0.025),ringInk(p-next,0.025)));
      last=next;
    }
  } else if(kind<13.0) {
    d=ovalInk(p-vec2(0.045,0),vec2(0.22,0.14));
    d=min(d,segment(p,vec2(-0.17,0),vec2(-0.33,0.14)));
    d=min(d,segment(p,vec2(-0.33,0.14),vec2(-0.33,-0.14)));
    d=min(d,segment(p,vec2(-0.33,-0.14),vec2(-0.17,0)));
    d=min(d,ringInk(p-vec2(0.17,0.035),0.025));
    if(detail>0.5) d=min(d,max(ovalInk(p-vec2(0.13,0),vec2(0.09,0.14)),p.x-0.13));
  } else if(kind<14.0) {
    d=max(ovalInk(p-vec2(0,0.10),vec2(0.24,0.20)),0.10-p.y);
    d=min(d,segment(p,vec2(-0.24,0.10),vec2(0.24,0.10)));
    for(int i=0;i<4;i++) {
      float k=float(i),x=-0.15+k*0.10;
      d=min(d,curveInk(p,vec2(x,0.10),vec2(x-0.065,-0.10),vec2(x+0.02,-0.29)));
    }
  } else if(kind<15.0) {
    d=min(ovalInk(p,vec2(0.026,0.28)),ringInk(p-vec2(0,0.29),0.038));
    vec2 q=rot(-0.32)*vec2(abs(p.x)-0.17,p.y-0.11);
    d=min(d,ovalInk(q,vec2(0.17,0.058)));
    q=rot(0.28)*vec2(abs(p.x)-0.15,p.y+0.035);
    d=min(d,ovalInk(q,vec2(0.15,0.050)));
  } else if(kind<16.0) {
    vec2 q=rot(-0.3)*p;
    float width=0.13*pow(max(0.0,1.0-pow(q.y/0.32,2.0)),0.7);
    d=max(abs(abs(q.x)-width),abs(q.y)-0.32);
    d=min(d,segment(q,vec2(0,-0.37),vec2(0,0.29)));
    if(detail>0.5) d=min(d,max(abs(sin((q.y-abs(q.x))*52.0))*0.014,max(abs(q.x)-width,abs(q.y)-0.29)));
  } else if(kind<17.0) {
    d=segment(p,vec2(0,-0.34),vec2(0,0.34));
    for(int i=0;i<5;i++) {
      float k=float(i),y=-0.22+k*0.105,w=0.19-k*0.027;
      vec2 q=rot(-0.65)*(mirror-vec2(w*0.5,y+0.035));
      d=min(d,ovalInk(q,vec2(w*0.62,0.032)));
    }
  } else if(kind<18.0) {
    d=segment(p,vec2(0,-0.34),vec2(0,-0.18));
    d=min(d,segment(mirror,vec2(0,0.33),vec2(0.15,0.11)));
    d=min(d,segment(mirror,vec2(0.15,0.11),vec2(0.07,0.11)));
    d=min(d,segment(mirror,vec2(0.07,0.11),vec2(0.21,-0.04)));
    d=min(d,segment(mirror,vec2(0.21,-0.04),vec2(0.12,-0.04)));
    d=min(d,segment(mirror,vec2(0.12,-0.04),vec2(0.27,-0.18)));
    d=min(d,segment(p,vec2(-0.27,-0.18),vec2(0.27,-0.18)));
  } else if(kind<19.0) {
    d=ovalInk(p-vec2(0,0.08),vec2(0.095,0.23));
    d=min(d,ovalInk(rot(-0.6)*(mirror-vec2(0.105,0.015)),vec2(0.085,0.21)));
    d=min(d,ovalInk(rot(-1.05)*(mirror-vec2(0.18,-0.065)),vec2(0.067,0.18)));
    d=min(d,arcInk(p,vec2(0,0.08),0.30,-2.45,-0.69));
  } else if(kind<20.0) {
    d=curveInk(mirror,vec2(0,0.13),vec2(0.15,0.37),vec2(0.25,0.14));
    d=min(d,curveInk(mirror,vec2(0.25,0.14),vec2(0.29,-0.01),vec2(0,-0.29)));
  } else if(kind<21.0) {
    // A closed path avoids the false interior dots at implicit-gradient poles.
    vec2 last=vec2(0.32,0);
    for(int i=1;i<=48;i++) {
      float t=float(i)*2.0*PI/48.0;
      vec2 next=vec2(0.32*cos(t),0.15*sin(2.0*t));
      d=min(d,segment(p,last,next)); last=next;
    }
  } else if(kind<22.0) {
    d=segment(mirror,vec2(0,0.35),vec2(0.18,0.15));
    d=min(d,segment(mirror,vec2(0.18,0.15),vec2(0.14,-0.23)));
    d=min(d,segment(mirror,vec2(0.14,-0.23),vec2(0,-0.34)));
    if(detail>0.5) {
      d=min(d,segment(mirror,vec2(0,0.35),vec2(0.065,0.12)));
      d=min(d,segment(mirror,vec2(0.065,0.12),vec2(0,-0.34)));
      d=min(d,segment(mirror,vec2(0.065,0.12),vec2(0.18,0.15)));
    }
  } else if(kind<23.0) {
    d=min(segment(p,vec2(-0.33,-0.18),vec2(-0.08,0.26)),segment(p,vec2(-0.08,0.26),vec2(0.20,-0.18)));
    d=min(d,min(segment(p,vec2(0.03,0.025),vec2(0.20,0.19)),segment(p,vec2(0.20,0.19),vec2(0.34,-0.18))));
    d=min(d,segment(p,vec2(-0.33,-0.18),vec2(0.34,-0.18)));
    d=min(d,ringInk(p-vec2(0.20,0.29),0.045));
  } else if(kind<24.0) {
    float cloud=min(length(p-vec2(-0.20,0.035))-0.10,min(length(p-vec2(-0.04,0.10))-0.16,length(p-vec2(0.16,0.06))-0.13));
    d=abs(max(cloud,-p.y-0.065));
    if(detail>0.5) for(int i=0;i<3;i++) {
      float x=-0.17+float(i)*0.16;
      d=min(d,segment(p,vec2(x,-0.13),vec2(x-0.04,-0.25)));
    }
  } else if(kind<25.0) {
    d=curveInk(p,vec2(0.05,0.33),vec2(-0.33,-0.01),vec2(-0.10,-0.24));
    d=min(d,curveInk(p,vec2(-0.10,-0.24),vec2(0.25,-0.36),vec2(0.20,-0.03)));
    d=min(d,curveInk(p,vec2(0.20,-0.03),vec2(0.04,0.04),vec2(0.05,0.33)));
    if(detail>0.5) d=min(d,curveInk(p,vec2(-0.035,-0.19),vec2(-0.09,-0.09),vec2(0.01,0.035)));
  } else if(kind<26.0) {
    d=curveInk(p,vec2(-0.33,-0.18),vec2(-0.19,0.38),vec2(0.13,0.20));
    d=min(d,curveInk(p,vec2(0.13,0.20),vec2(0.29,0.10),vec2(0.10,0.015)));
    d=min(d,curveInk(p,vec2(0.10,0.015),vec2(0.14,-0.15),vec2(0.33,-0.18)));
    d=min(d,segment(p,vec2(-0.33,-0.18),vec2(0.33,-0.18)));
    if(detail>0.5) d=min(d,curveInk(p,vec2(-0.20,-0.13),vec2(-0.07,0.22),vec2(0.10,0.10)));
  } else if(kind<27.0) {
    vec2 q=abs(p);
    d=min(segment(q,vec2(0,0),vec2(0.19,0.24)),segment(q,vec2(0,0.29),vec2(0.22,0.29)));
    d=min(d,segment(q,vec2(0.19,0.24),vec2(0.19,0.29)));
    if(detail>0.5) d=min(d,segment(p,vec2(-0.12,-0.20),vec2(0.12,-0.20)));
  } else if(kind<28.0) {
    d=min(ringInk(p-vec2(0,0.18),0.115),segment(p,vec2(0,0.065),vec2(0,-0.33)));
    d=min(d,segment(p,vec2(0,-0.30),vec2(0.13,-0.30)));
    d=min(d,segment(p,vec2(0.13,-0.30),vec2(0.13,-0.23)));
    if(detail>0.5) d=min(d,ringInk(p-vec2(0,0.18),0.05));
  } else if(kind<29.0) {
    d=boxInk(p,vec2(0.17,0.22));
    d=min(d,arcInk(p,vec2(0,0.23),0.09,0.0,PI));
    d=min(d,segment(p,vec2(-0.20,-0.26),vec2(0.20,-0.26)));
    d=min(d,ovalInk(p-vec2(0,-0.07),vec2(0.045,0.095)));
    if(detail>0.5) d=min(d,segment(mirror,vec2(0.13,-0.21),vec2(0.13,0.21)));
  } else if(kind<30.0) {
    d=max(ovalInk(p-vec2(0,0.05),vec2(0.13,0.29)),-0.16-p.y);
    d=min(d,segment(p,vec2(-0.095,-0.16),vec2(0.095,-0.16)));
    d=min(d,ringInk(p-vec2(0,0.12),0.055));
    d=min(d,segment(mirror,vec2(0.125,0),vec2(0.23,-0.21)));
    d=min(d,segment(mirror,vec2(0.23,-0.21),vec2(0.10,-0.16)));
    d=min(d,segment(mirror,vec2(0.055,-0.21),vec2(0,-0.35)));
  } else if(kind<31.0) {
    vec2 q=p*vec2(1,1.35); float rr=length(q),aa=atan(q.y,q.x);
    d=max(abs(sin(aa*2.0-rr*19.0-seed*PI))*0.026,max(0.06-rr,rr-0.33));
    d=min(d,ringInk(q,0.045));
  } else if(kind<32.0) {
    float fold=mod(a+PI/6.0,PI/3.0)-PI/6.0;
    vec2 q=r*vec2(cos(fold),sin(fold));
    d=segment(q,vec2(0),vec2(0.35,0));
    d=min(d,segment(vec2(q.x,abs(q.y)),vec2(0.17,0),vec2(0.24,0.075)));
    d=min(d,segment(vec2(q.x,abs(q.y)),vec2(0.27,0),vec2(0.32,0.045)));
    if(detail>0.5) d=min(d,ringInk(p,0.085));
  } else if(kind<33.0) {
    d=max(ovalInk(p-vec2(0,-0.03),vec2(0.23,0.28)),p.y-0.16);
    d=min(d,ringInk(mirror-vec2(0.095,0.09),0.072));
    d=min(d,ringInk(mirror-vec2(0.095,0.09),0.025));
    d=min(d,segment(mirror,vec2(0,0.015),vec2(0.045,-0.005)));
    d=min(d,segment(mirror,vec2(0.045,-0.005),vec2(0,-0.065)));
    d=min(d,segment(mirror,vec2(0.16895,0.16),vec2(0.23,0.30)));
    d=min(d,segment(mirror,vec2(0.23,0.30),vec2(0.22270,0.04)));
    d=min(d,segment(p,vec2(-0.16895,0.16),vec2(0.16895,0.16)));
    if(detail>0.5) d=min(d,arcInk(p,vec2(0,0.02),0.19,-2.65,-0.49));
  } else if(kind<34.0) {
    d=max(ovalInk(p,vec2(0.23,0.20)),p.y-0.10);
    d=min(d,segment(mirror,vec2(0.199186,0.10),vec2(0.19,0.30)));
    d=min(d,segment(mirror,vec2(0.19,0.30),vec2(0.07,0.16)));
    d=min(d,segment(p,vec2(-0.07,0.16),vec2(0.07,0.16)));
    d=min(d,arcInk(mirror,vec2(0.10,0.025),0.045,0.0,PI));
    d=min(d,segment(p,vec2(0,0),vec2(0,-0.06)));
    d=min(d,segment(mirror,vec2(0.12,-0.065),vec2(0.32,-0.035)));
    d=min(d,segment(mirror,vec2(0.12,-0.095),vec2(0.31,-0.13)));
  } else if(kind<35.0) {
    d=ovalInk(p,vec2(0.20,0.24));
    d=min(d,ovalInk(p-vec2(0,0.30),vec2(0.065,0.072)));
    d=min(d,ovalInk(abs(p)-vec2(0.20,0.16),vec2(0.06,0.043)));
    if(detail>0.5) {
      d=min(d,ringInk(p,0.10));
      d=min(d,max(abs(sin(a*3.0))*r,max(0.10-r,r-0.20)));
    }
  } else if(kind<36.0) {
    d=max(ovalInk(p-vec2(0,0.13),vec2(0.18,0.20)),-0.005-p.y);
    d=min(d,ringInk(mirror-vec2(0.065,0.09),0.024));
    for(int i=0;i<4;i++) {
      float k=float(i),x=-0.15+k*0.10+0.035*sin(p.y*21.0+k*1.8);
      d=min(d,max(abs(p.x-x)*0.7,max(p.y,-0.29-p.y)));
    }
  } else if(kind<37.0) {
    vec2 q=p-vec2(0,0.10); float rr=length(q),aa=atan(q.y,q.x);
    d=abs(rr-(0.18+0.025*cos(aa*5.0)));
    d=min(d,max(abs(sin(rr*36.0-aa*2.0))*0.02,rr-0.17));
    d=min(d,segment(p,vec2(0,-0.07),vec2(0,-0.34)));
    d=min(d,ovalInk(rot(-0.65)*(p-vec2(0.08,-0.18)),vec2(0.11,0.032)));
  } else if(kind<38.0) {
    float trunk=length(vec2(p.x,p.y-clamp(p.y,-0.30,0.24)))-0.065;
    float arm=length(vec2(abs(p.x)-0.18,p.y-clamp(p.y,-0.02,0.14)))-0.045;
    float join=length(vec2(abs(p.x)-clamp(abs(p.x),0.065,0.18),p.y+0.02))-0.045;
    d=abs(min(trunk,min(arm,join)));
    if(detail>0.5) d=min(d,segment(p,vec2(0,-0.27),vec2(0,0.22)));
  } else if(kind<39.0) {
    d=ovalInk(p,vec2(0.12,0.20));
    d=min(d,ovalInk(rot(-0.5)*(mirror-vec2(0.18,0.10)),vec2(0.09,0.16)));
    d=min(d,ringInk(p-vec2(0,0.24),0.065));
    if(detail>0.5) d=min(d,max(abs(sin(p.y*34.0))*0.024,length(p/vec2(0.12,0.20))-1.0));
    d=min(d,segment(mirror,vec2(0.035,0.29),vec2(0.085,0.35)));
  } else {
    d=segment(p,vec2(-0.24,-0.18),vec2(0.24,-0.18));
    d=min(d,segment(mirror,vec2(0.24,-0.18),vec2(0.30,0.16)));
    d=min(d,segment(mirror,vec2(0.30,0.16),vec2(0.12,0.035)));
    d=min(d,segment(mirror,vec2(0.12,0.035),vec2(0,0.27)));
    d=min(d,segment(p,vec2(-0.25,-0.11),vec2(0.25,-0.11)));
    if(detail>0.5) d=min(d,ringInk(p-vec2(0,-0.035),0.035));
  }
  return max(max(d,0.0),r-0.40);
}
`;
