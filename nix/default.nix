{
  mkBunDerivation,
  bunNix,
  src,
  ...
}:

mkBunDerivation {
  pname = "oc-plugins";
  version = "1.0.0";
  src = src;
  bunNix = bunNix;
}
