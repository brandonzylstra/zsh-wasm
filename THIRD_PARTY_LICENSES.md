Third-Party Licenses
====================

The `zsh.wasm` binary that zsh-wasm publishes is a single compiled artifact
containing six separate codebases. This file carries their license texts, each
one extracted verbatim from the source files it governs.

**If you redistribute `zsh.wasm`, the npm package, or a bundle built from
either, you are redistributing all six.** Every license below is permissive and
they do not conflict with one another, but each asks that its notice travel with
the software. Shipping this file is how that is satisfied.

zsh-wasm's own code is covered separately by `LICENSE`.

| Component | Where | License | Beyond attribution? |
| --- | --- | --- | --- |
| Zsh 5.9 | the shell itself | Zsh (MIT-like) | no |
| OpenBSD sed | the `sed` builtin | BSD-3-Clause | no |
| one-true-awk | the `awk` builtin | Lucent 1997 | **yes** — name not to be used in advertising |
| Gavin Howard bc | the `bc` builtin | BSD-2-Clause (+ two files, below) | no |
| sbase | 17 coreutils builtins | MIT | no |
| OpenBSD diff | the `diff` builtin | ISC + BSD-3-Clause + **BSD-4-Clause** | **yes** — advertising acknowledgement |


The two terms that ask for more than attribution
------------------------------------------------

Everything here is permissive, but two components say something about names in
advertising, and they happen to say opposite things.

**one-true-awk (Lucent).** The name Lucent Technologies may not be used in
advertising or publicity pertaining to distribution of the software without
prior written permission.

**OpenBSD diff (Caldera).** `diffreg.c` descends from the original Research UNIX
`diff`. Copyright in the ancient UNIX sources passed from AT&T to Novell to SCO
to Caldera International, which released them under a BSD-style license in 2002
so the BSDs could stop worrying about their ancestry. That license has four
clauses, and the third is an advertising clause:

> 3. All advertising materials mentioning features or use of this software
>    must display the following acknowledgement:
>       This product includes software developed or owned by Caldera
>       International, Inc.

This is not the University of California's advertising clause, which Berkeley
rescinded in 1999. Caldera's is separate and still stands. It binds advertising
material — not the software, not its documentation, not a README feature list.
Distributing this package does not trigger it. If zsh-wasm is ever advertised on
the strength of what it can do, that acknowledgement belongs in the
advertisement.

It is the same term under which OpenBSD, FreeBSD, NetBSD and macOS have all
shipped `diff` for over twenty years. The practical cost is not legal exposure:
it is that some corporate license scanners flag 4-clause BSD as non-approved,
which produces a conversation rather than a problem. Building without
`--with-diff` avoids the term entirely.



1. Zsh 5.9
----------------------------------------------------------------------

The shell itself. Source: `zsh-5.9/LICENCE` (also reproduced in `LICENSE`).

```
Unless otherwise noted in the header of specific files, files in this
distribution have the licence shown below.

However, note that certain shell functions are licensed under versions
of the GNU General Public Licence.  Anyone distributing the shell as a
binary including those files needs to take account of this.  Search
shell functions for "Copyright" for specific copyright information.
None of the core functions are affected by this, so those files may
simply be omitted.

--

The Z Shell is copyright (c) 1992-2017 Paul Falstad, Richard Coleman,
Zoltán Hidvégi, Andrew Main, Peter Stephenson, Sven Wischnowsky, and
others.  All rights reserved.  Individual authors, whether or not
specifically named, retain copyright in all changes; in what follows, they
are referred to as `the Zsh Development Group'.  This is for convenience
only and this body has no legal status.  The Z shell is distributed under
the following licence; any provisions made in individual files take
precedence.

Permission is hereby granted, without written agreement and without
licence or royalty fees, to use, copy, modify, and distribute this
software and to distribute modified versions of this software for any
purpose, provided that the above copyright notice and the following
two paragraphs appear in all copies of this software.

In no event shall the Zsh Development Group be liable to any party for
direct, indirect, special, incidental, or consequential damages arising out
of the use of this software and its documentation, even if the Zsh
Development Group have been advised of the possibility of such damage.

The Zsh Development Group specifically disclaim any warranties, including,
but not limited to, the implied warranties of merchantability and fitness
for a particular purpose.  The software provided hereunder is on an "as is"
basis, and the Zsh Development Group have no obligation to provide
maintenance, support, updates, enhancements, or modifications.
```


2. OpenBSD sed — the `sed` builtin
----------------------------------------------------------------------

Source: header of `sed-src/main.c`. The same notice covers `compile.c`, `process.c` and `misc.c`.

```
/*	$OpenBSD: main.c,v 1.47 2024/07/17 20:57:16 millert Exp $	*/

/*-
 * Copyright (c) 1992 Diomidis Spinellis.
 * Copyright (c) 1992, 1993
 *	The Regents of the University of California.  All rights reserved.
 *
 * This code is derived from software contributed to Berkeley by
 * Diomidis Spinellis of Imperial College, University of London.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the University nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS'' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 */

```


3. one-true-awk — the `awk` builtin
----------------------------------------------------------------------

Source: `awk-20260426/LICENSE`.

```
/****************************************************************
Copyright (C) Lucent Technologies 1997
All Rights Reserved

Permission to use, copy, modify, and distribute this software and
its documentation for any purpose and without fee is hereby
granted, provided that the above copyright notice appear in all
copies and that both that the copyright notice and this
permission notice and warranty disclaimer appear in supporting
documentation, and that the name Lucent Technologies or any of
its entities not be used in advertising or publicity pertaining
to distribution of the software without specific, written prior
permission.

LUCENT DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE,
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
IN NO EVENT SHALL LUCENT OR ANY OF ITS ENTITIES BE LIABLE FOR ANY
SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER
IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
****************************************************************/
```


4. Gavin Howard bc — the `bc` builtin
----------------------------------------------------------------------

Source: `bc-7.0.3/LICENSE.md`. The main BSD-2-Clause grant is first; `history.c` and `rand.c` carry their own copyrights and are reproduced after it. Both files are compiled into this build even though their features are disabled at compile time, so their notices are included.

```
# License

Copyright (c) 2018-2024 Gavin D. Howard <gavin@gavinhoward.com>

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## History

The files `src/history.c` and `include/history.h` are under the following
copyrights and license:

Copyright (c) 2010-2014, Salvatore Sanfilippo <antirez at gmail dot com><br>
Copyright (c) 2010-2013, Pieter Noordhuis <pcnoordhuis at gmail dot com><br>
Copyright (c) 2018 rain-1 <rain1@openmailbox.org><br>
Copyright (c) 2018-2023, Gavin D. Howard <gavin@gavinhoward.com>

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Rand

The files `src/rand.c` and `include/rand.h` are under the following copyrights
and license:

Copyright (c) 2014-2017 Melissa O'Neill and PCG Project contributors<br>
Copyright (c) 2018-2024 Gavin D. Howard <gavin@gavinhoward.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## `scripts/safe-install.sh`

The file `scripts/safe-install.sh` is under the following copyright and license:

Copyright (c) 2021 Rich Felker

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the “Software”), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## `scripts/ministat.c`

The file `scripts/ministat.c` is under the following license:

"THE BEER-WARE LICENSE" (Revision 42):

<phk@FreeBSD.ORG> wrote this file. As long as you retain this notice you
can do whatever you want with this stuff. If we meet some day, and you think
this stuff is worth it, you can buy me a beer in return.   Poul-Henning Kamp
```


5. sbase — the 17 coreutils builtins
----------------------------------------------------------------------

Source: `sbase-src/LICENSE`. Covers `wc`, `sort`, `cut`, `head`, `tail`, `uniq`, `tr`, `cat`, `tee`, `seq`, `touch`, `mktemp`, `ls`, `basename`, `dirname`, `printenv` and `grep`.

```
MIT License

© 2011 Connor Lane Smith <cls@lubutu.com>
© 2011-2016 Dimitris Papastamos <sin@2f30.org>
© 2014-2016 Laslo Hunhold <dev@frign.de>

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

Authors/contributors include:

© 2011 Kamil Cholewiński <harry666t@gmail.com>
© 2011 Rob Pilling <robpilling@gmail.com>
© 2011 Hiltjo Posthuma <hiltjo@codemadness.org>
© 2011 pancake <pancake@youterm.com>
© 2011 Random832 <random832@fastmail.us>
© 2012 William Haddon <william@haddonthethird.net>
© 2012 Kurt H. Maier <khm@sciops.net>
© 2012 Christoph Lohmann <20h@r-36.net>
© 2012 David Galos <galosd83@students.rowan.edu>
© 2012 Robert Ransom <rransom.8774@gmail.com>
© 2013 Jakob Kramer <jakob.kramer@gmx.de>
© 2013 Anselm R Garbe <anselm@garbe.us>
© 2013 Truls Becken <truls.becken@gmail.com>
© 2013 dsp <dsp@2f30.org>
© 2013 Markus Teich <markus.teich@stusta.mhn.de>
© 2013 Jesse Ogle <jesse.p.ogle@gmail.com>
© 2013 Lorenzo Cogotti <miciamail@hotmail.it>
© 2013 Federico G. Benavento <benavento@gmail.com>
© 2013 Roberto E. Vargas Caballero <k0ga@shike2.com>
© 2013 Christian Hesse <mail@eworm.de>
© 2013 Markus Wichmann <nullplan@gmx.net>
© 2014 Silvan Jegen <s.jegen@gmail.com>
© 2014 Daniel Bainton <dpb@driftaway.org>
© 2014 Tuukka Kataja <stuge@xor.fi>
© 2014 Jeffrey Picard <jeff@jeffreypicard.com>
© 2014 Evan Gates <evan.gates@gmail.com>
© 2014 Michael Forney <mforney@mforney.org>
© 2014 Ari Malinen <ari.malinen@gmail.com>
© 2014 Brandon Mulcahy <brandon@jangler.info>
© 2014 Adria Garriga <rhaps0dy@installgentoo.com>
© 2014-2015 Greg Reagle <greg.reagle@umbc.edu>
© 2015 Tai Chi Minh Ralph Eastwood <tcmreastwood@gmail.com>
© 2015 Quentin Rameau <quinq@fifth.space>
© 2015 Dionysis Grigoropoulos <info@erethon.com>
© 2015 Wolfgang Corcoran-Mathe <wcm@sigwinch.xyz>
© 2016 Mattias Andrée <m@maandree.se>
© 2016 Eivind Uggedal <eivind@uggedal.com>
```


6a. OpenBSD diff — ISC portion
----------------------------------------------------------------------

Source: header of `diff-src/diff.c`. The same notice covers `diffdir.c`, `xmalloc.c` and `xmalloc.h`.

```
/*	$OpenBSD: diff.c,v 1.69 2026/02/18 15:25:01 deraadt Exp $	*/

/*
 * Copyright (c) 2003 Todd C. Miller <millert@openbsd.org>
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * Sponsored in part by the Defense Advanced Research Projects
 * Agency (DARPA) and Air Force Research Laboratory, Air Force
 * Materiel Command, USAF, under agreement number F39502-99-1-0512.
 */

```


6b. OpenBSD diff — Caldera 4-clause and Regents 3-clause portions
----------------------------------------------------------------------

Source: header of `diff-src/diffreg.c`. **This is the file carrying the advertising clause discussed above.**

```
/*	$OpenBSD: diffreg.c,v 1.96 2026/04/01 17:47:46 deraadt Exp $	*/

/*
 * Copyright (C) Caldera International Inc.  2001-2002.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code and documentation must retain the above
 *    copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. All advertising materials mentioning features or use of this software
 *    must display the following acknowledgement:
 *	This product includes software developed or owned by Caldera
 *	International, Inc.
 * 4. Neither the name of Caldera International, Inc. nor the names of other
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * USE OF THE SOFTWARE PROVIDED FOR UNDER THIS LICENSE BY CALDERA
 * INTERNATIONAL, INC. AND CONTRIBUTORS ``AS IS'' AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL CALDERA INTERNATIONAL, INC. BE LIABLE FOR ANY DIRECT,
 * INDIRECT INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
/*-
 * Copyright (c) 1991, 1993
 *	The Regents of the University of California.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the University nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS'' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 *
 *	@(#)diffreg.c   8.1 (Berkeley) 6/6/93
 */

```
